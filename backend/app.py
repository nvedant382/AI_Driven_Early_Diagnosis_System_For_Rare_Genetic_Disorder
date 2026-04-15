from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import sqlite3
import os
import tempfile
import subprocess
import traceback

app = Flask(__name__)
CORS(app)

DB_FILE = 'users.db'

# ─── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
BIO_DIR = os.path.join(PROJECT_DIR, "Bioinformatics")

MODEL_PATH = os.path.join(BASE_DIR, "model", "rf_ann_model.pkl")
SNPEFF_JAR = os.path.join(BIO_DIR, "tools", "snpEff", "snpEff.jar")
SNPEFF_CONFIG = os.path.join(BIO_DIR, "tools", "snpEff", "snpEff.config")
SNPEFF_DATA_DIR = os.path.join(BIO_DIR, "tools", "snpEff", "data")

ORPHANET_GENE_XML = os.path.join(BIO_DIR, "data", "external", "orphanet", "disease_gene_associations.xml")
ORPHANET_PHENO_XML = os.path.join(BIO_DIR, "data", "external", "orphanet", "disease_phenotype.xml")
HPO_JSON_PATH = os.path.join(BIO_DIR, "data", "external", "hpo", "hp.json")

# ─── DB Init ────────────────────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

# ─── Auth Endpoints ─────────────────────────────────────────────────────────────
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'message': 'Username and password are required'}), 400

    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('INSERT INTO users (username, password) VALUES (?, ?)', (username, password))
        conn.commit()
        conn.close()
        return jsonify({'message': 'User registered successfully'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'message': 'Username already exists'}), 409
    except Exception as e:
        return jsonify({'message': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'message': 'Username and password are required'}), 400

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT id, username FROM users WHERE username = ? AND password = ?', (username, password))
    user = c.fetchone()
    conn.close()

    if user:
        return jsonify({'message': 'Login successful', 'user': {'id': user[0], 'username': user[1]}}), 200
    else:
        return jsonify({'message': 'Invalid credentials'}), 401

# ─── Pipeline Endpoint ──────────────────────────────────────────────────────────
@app.route('/api/predict', methods=['POST'])
def predict():
    """
    Full genomic pipeline:
      1. Accept VCF file + symptoms
      2. Normalize & annotate VCF (bcftools + SnpEff)
      3. Parse annotations, predict pathogenicity (RF model)
      4. Map to diseases (Orphanet), score with symptoms (HPO)
      5. Return clinical report JSON
    """
    import pandas as pd
    import numpy as np
    import joblib
    import json
    import xml.etree.ElementTree as ET

    try:
        # ── Validate inputs ──
        if 'vcf_file' not in request.files:
            return jsonify({'error': 'No VCF file uploaded'}), 400

        vcf_file = request.files['vcf_file']
        if not vcf_file.filename.endswith('.vcf'):
            return jsonify({'error': 'File must be a .vcf file'}), 400

        symptoms_raw = request.form.get('symptoms', '[]')
        try:
            patient_symptoms = json.loads(symptoms_raw)
        except json.JSONDecodeError:
            patient_symptoms = []

        # ── Create temp working directory ──
        work_dir = tempfile.mkdtemp(prefix="vcf_pipeline_")
        raw_vcf = os.path.join(work_dir, "patient.vcf")
        norm_vcf = os.path.join(work_dir, "patient.norm.vcf.gz")
        ann_vcf = os.path.join(work_dir, "patient_annotated.vcf")
        ann_vcf_gz = ann_vcf + ".gz"

        vcf_file.save(raw_vcf)

        # ══════════════════════════════════════════════════════════════════════
        # PHASE 2: Annotation & Prediction
        # ══════════════════════════════════════════════════════════════════════

        # Step 2.1: Normalize VCF with bcftools
        # Use -Ov to output plain VCF in the pipe (avoids BCF format issues
        # with VCF files missing contig definitions in the header)
        vcf_for_snpeff = raw_vcf  # fallback: use raw VCF if norm fails

        cmd_norm = f'bcftools norm -m -any -Ov "{raw_vcf}" | bcftools sort -Oz -o "{norm_vcf}"'
        result = subprocess.run(cmd_norm, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            # Index normalized VCF
            subprocess.run(f'tabix -p vcf "{norm_vcf}"', shell=True, capture_output=True, text=True)
            vcf_for_snpeff = norm_vcf
            print(f"[Pipeline] bcftools normalization succeeded")
        else:
            # Fallback: try just bgzip + index the raw VCF
            print(f"[Pipeline] bcftools norm failed, trying direct bgzip fallback...")
            raw_gz = raw_vcf + ".gz"
            r2 = subprocess.run(f'bgzip -c "{raw_vcf}" > "{raw_gz}" && tabix -p vcf "{raw_gz}"',
                                shell=True, capture_output=True, text=True)
            if r2.returncode == 0:
                vcf_for_snpeff = raw_gz
                print(f"[Pipeline] Direct bgzip succeeded")
            else:
                # Last resort: use raw uncompressed VCF with SnpEff
                vcf_for_snpeff = raw_vcf
                print(f"[Pipeline] Using raw VCF directly for SnpEff")

        # Step 2.3: Annotate with SnpEff
        # -noNextProt -noMotif: skip optional databases (may have version mismatch)
        # Using -Xmx8g to prevent OutOfMemoryError during database loading
        snpeff_cmd = f'java -Xmx8g -jar "{SNPEFF_JAR}" -noNextProt -noMotif'
        if os.path.exists(SNPEFF_CONFIG):
            snpeff_cmd += f' -c "{SNPEFF_CONFIG}"'
        snpeff_cmd += f' -dataDir "{SNPEFF_DATA_DIR}" GRCh38.86 "{vcf_for_snpeff}" > "{ann_vcf}"'

        result = subprocess.run(snpeff_cmd, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            return jsonify({'error': f'SnpEff annotation failed: {result.stderr[:500]}'}), 500

        # Step 2.4: Compress & index annotated VCF
        subprocess.run(f'bgzip -f "{ann_vcf}"', shell=True, capture_output=True)
        subprocess.run(f'tabix -p vcf "{ann_vcf_gz}"', shell=True, capture_output=True)

        # Step 2.5: Parse annotated VCF with cyvcf2
        from cyvcf2 import VCF
        vcf_reader = VCF(ann_vcf_gz)
        rows = []

        for var in vcf_reader:
            ann = var.INFO.get("ANN")
            effect = impact = gene = biotype = None

            if ann:
                first = ann.split(",")[0]
                p = first.split("|")
                effect  = p[1] if len(p) > 1 else None
                impact  = p[2] if len(p) > 2 else None
                gene    = p[3] if len(p) > 3 else None
                biotype = p[7] if len(p) > 7 else None

            rows.append({
                "CHROM": var.CHROM,
                "POS": var.POS,
                "REF": var.REF,
                "ALT": var.ALT[0] if len(var.ALT) else "",
                "GeneName": gene,
                "Effect": effect,
                "Impact": impact,
                "Transcript_BioType": biotype
            })

        df = pd.DataFrame(rows)

        # Step 2.6: Feature engineering
        df["REF_len"] = df["REF"].apply(len)
        df["ALT_len"] = df["ALT"].apply(len)

        # Step 2.7: Load model & predict
        model = joblib.load(MODEL_PATH)
        features = df[["CHROM", "POS", "REF_len", "ALT_len", "Effect", "Impact", "Transcript_BioType"]]

        df["Prediction"]  = model.predict(features)
        df["Probability"] = model.predict_proba(features)[:, 1]

        # Step 2.8: Get top 20 pathogenic variants
        top20 = df.sort_values(by="Probability", ascending=False).head(20)
        df_path = top20[top20["Prediction"] == 1]

        if len(df_path) == 0:
            # Fallback: use top 20 by probability even if not predicted pathogenic
            df_path = top20

        total_pathogenic = int((df["Prediction"] == 1).sum())

        # ══════════════════════════════════════════════════════════════════════
        # PHASE 3: Disease Mapping & Symptom Scoring
        # ══════════════════════════════════════════════════════════════════════

        # Step 3.1: Parse Orphanet gene → disease
        gene_to_disease = {}
        if os.path.exists(ORPHANET_GENE_XML):
            tree = ET.parse(ORPHANET_GENE_XML)
            root = tree.getroot()
            for disorder in root.findall(".//Disorder"):
                disease_name = disorder.findtext("Name", default="Unknown Disease")
                for gene_el in disorder.findall(".//Gene"):
                    gene_symbol = gene_el.findtext("Symbol")
                    if gene_symbol:
                        gene_to_disease.setdefault(gene_symbol, set()).add(disease_name)
            gene_to_disease = {g: sorted(list(v)) for g, v in gene_to_disease.items()}

        # Step 3.2: Parse Orphanet disease → HPO
        disease_to_hpo = {}
        if os.path.exists(ORPHANET_PHENO_XML):
            tree_p = ET.parse(ORPHANET_PHENO_XML)
            root_p = tree_p.getroot()
            for disorder in root_p.findall(".//Disorder"):
                disease_name = disorder.findtext("Name", default="Unknown Disease")
                hpo_list = [
                    pheno.findtext("HPOId")
                    for pheno in disorder.findall(".//Phenotype")
                    if pheno.findtext("HPOId") is not None
                ]
                disease_to_hpo[disease_name] = list(set(hpo_list))

        # Step 3.3: Parse HPO ID → name
        id_to_hpo_name = {}
        if os.path.exists(HPO_JSON_PATH):
            with open(HPO_JSON_PATH, "r") as f:
                hp = json.load(f)
            id_to_hpo_name = {
                term["id"]: term.get("name", "")
                for term in hp.get("graphs", [{}])[0].get("nodes", [])
                if "id" in term
            }

        # Step 3.4: Build disease mapping table
        results = []
        for _, row in df_path.iterrows():
            gene = row["GeneName"]
            diseases = gene_to_disease.get(gene, [])

            disease_entries = []
            for d in diseases:
                hpos = disease_to_hpo.get(d, [])
                disease_entries.append({
                    "Disease": d,
                    "Phenotypes": [id_to_hpo_name.get(h, h) for h in hpos]
                })

            results.append({
                "CHROM": row["CHROM"],
                "POS": int(row["POS"]),
                "REF": row["REF"],
                "ALT": row["ALT"],
                "GeneName": gene,
                "Effect": row["Effect"],
                "Impact": row["Impact"],
                "Probability": float(row["Probability"]),
                "Diseases": diseases,
                "DiseaseDetails": disease_entries
            })

        df_diag = pd.DataFrame(results).sort_values("Probability", ascending=False) if results else pd.DataFrame()

        # Step 3.5: Symptom cross-check & scoring
        scored = []
        if len(patient_symptoms) > 0 and len(df_diag) > 0:
            # Match patient symptoms to HPO names (case-insensitive)
            patient_symptom_lower = [s.lower().strip() for s in patient_symptoms]

            for _, row in df_diag.iterrows():
                gene = row["GeneName"]
                for entry in row["DiseaseDetails"]:
                    disease = entry["Disease"]
                    phenotype_names = entry["Phenotypes"]
                    disease_pheno_lower = [n.lower() for n in phenotype_names]

                    overlap = len(set(patient_symptom_lower) & set(disease_pheno_lower))
                    match_fraction = overlap / max(1, len(patient_symptom_lower))

                    scored.append({
                        "Disease": disease,
                        "Gene": gene,
                        "Variant": f"{row['CHROM']}:{row['POS']} {row['REF']}>{row['ALT']}",
                        "Overlap": overlap,
                        "MatchFraction": match_fraction,
                        "ML_Probability": float(row["Probability"]),
                        "Effect": row["Effect"],
                        "Impact": row["Impact"],
                    })
        elif len(df_diag) > 0:
            # No symptoms - still create entries with 0 match
            for _, row in df_diag.iterrows():
                gene = row["GeneName"]
                for entry in row["DiseaseDetails"]:
                    scored.append({
                        "Disease": entry["Disease"],
                        "Gene": gene,
                        "Variant": f"{row['CHROM']}:{row['POS']} {row['REF']}>{row['ALT']}",
                        "Overlap": 0,
                        "MatchFraction": 0.0,
                        "ML_Probability": float(row["Probability"]),
                        "Effect": row["Effect"],
                        "Impact": row["Impact"],
                    })

        # Step 3.6: Compute disease likelihood score
        df_final = pd.DataFrame(scored)
        if len(df_final) > 0:
            # Variant count per disease
            variant_weights = df_final.groupby("Disease")["Variant"].count().to_dict()

            # Impact weights
            impact_map = {"HIGH": 1.0, "MODERATE": 0.7, "LOW": 0.3, "MODIFIER": 0.1}

            alpha, beta, gamma, delta = 0.50, 0.35, 0.10, 0.05
            scores_list = []
            for _, row in df_final.iterrows():
                dis = row["Disease"]
                score = (
                    alpha * row["ML_Probability"]
                    + beta * row["MatchFraction"]
                    + gamma * (variant_weights.get(dis, 1) / 5)
                    + delta * impact_map.get(str(row.get("Impact", "")), 0.3)
                )
                scores_list.append(score)

            df_final["DiseaseLikelihoodScore"] = scores_list
            df_final = df_final.sort_values("DiseaseLikelihoodScore", ascending=False)

        # ══════════════════════════════════════════════════════════════════════
        # BUILD RESPONSE JSON
        # ══════════════════════════════════════════════════════════════════════

        # Top 5 diagnoses
        top5_diagnoses = []
        if len(df_final) > 0:
            for _, row in df_final.head(5).iterrows():
                top5_diagnoses.append({
                    "disease": row["Disease"],
                    "gene": row["Gene"],
                    "score": round(float(row["DiseaseLikelihoodScore"]), 4)
                })

        # Key pathogenic variants (top 5)
        key_variants = []
        for _, r in df_path.sort_values("Probability", ascending=False).head(5).iterrows():
            key_variants.append({
                "location": f"{r['CHROM']}:{r['POS']}",
                "change": f"{r['REF']}>{r['ALT']}",
                "gene": r["GeneName"],
                "effect": r["Effect"],
                "impact": r["Impact"],
                "probability": round(float(r["Probability"]), 3)
            })

        # Summary
        report = {
            "summary": {
                "totalPathogenicVariants": total_pathogenic,
                "symptomsProvided": patient_symptoms,
                "mostLikelyDiagnosis": top5_diagnoses[0]["disease"] if top5_diagnoses else "N/A",
                "responsibleGene": top5_diagnoses[0]["gene"] if top5_diagnoses else "N/A",
                "likelihoodScore": top5_diagnoses[0]["score"] if top5_diagnoses else 0.0,
            },
            "top5Diagnoses": top5_diagnoses,
            "keyVariants": key_variants,
            "totalVariantsParsed": len(df),
        }

        # Cleanup temp files
        import shutil
        shutil.rmtree(work_dir, ignore_errors=True)

        return jsonify(report), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


# ─── Health Check ────────────────────────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    """Check which pipeline prerequisites are available."""
    checks = {
        "model": os.path.exists(MODEL_PATH),
        "snpEff": os.path.exists(SNPEFF_JAR),
        "orphanet_gene": os.path.exists(ORPHANET_GENE_XML),
        "orphanet_pheno": os.path.exists(ORPHANET_PHENO_XML),
        "hpo_json": os.path.exists(HPO_JSON_PATH),
        "bcftools": subprocess.run("which bcftools", shell=True, capture_output=True).returncode == 0,
        "tabix": subprocess.run("which tabix", shell=True, capture_output=True).returncode == 0,
        "java": subprocess.run("which java", shell=True, capture_output=True).returncode == 0,
    }
    all_ok = all(checks.values())
    return jsonify({"ready": all_ok, "checks": checks}), 200 if all_ok else 503


if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
