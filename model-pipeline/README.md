# VCF Genomic Prediction Pipeline

A complete machine-learning pipeline that takes a raw **patient VCF file** as input and produces **pathogenicity predictions**, **disease mappings**, **symptom-ranked diagnoses**, and a **clinical PDF report** as output.

---

## Table of Contents

- [Pipeline Overview](#pipeline-overview)
- [Architecture Diagram](#architecture-diagram)
- [Notebooks](#notebooks)
- [Required Input Files](#required-input-files)
- [Required External Data & Tools](#required-external-data--tools)
- [Output Files](#output-files)
- [Step-by-Step Pipeline Walkthrough](#step-by-step-pipeline-walkthrough)
  - [Phase 1 — Model Training](#phase-1--model-training-03_rf_modelipynb)
  - [Phase 2 — Patient VCF Annotation & Prediction](#phase-2--patient-vcf-annotation--prediction-04_patient_file_annotationipynb)
  - [Phase 3 — Disease Mapping & Symptom Scoring](#phase-3--disease-mapping--symptom-scoring-05_disease_mapping_pipelineipynb)
- [Dependencies & Installation](#dependencies--installation)
- [Directory Structure](#directory-structure)

---

## Pipeline Overview

The pipeline consists of **three sequential notebooks**, each handling a distinct stage:

| # | Notebook | Purpose |
|---|----------|---------|
| 1 | `03_RF_Model.ipynb` | Train a Random Forest classifier on ClinVar-annotated data to predict variant pathogenicity |
| 2 | `04_patient_file_annotation.ipynb` | Annotate a raw patient VCF file with SnpEff, parse annotations, and predict pathogenicity using the trained model |
| 3 | `05_disease_mapping_pipeline.ipynb` | Map pathogenic variants → diseases (Orphanet) → phenotypes (HPO), cross-check with patient symptoms, and generate a clinical diagnosis report |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        INPUT: Raw Patient VCF File                      │
│                        (e.g. patient_rett.vcf)                          │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │  PHASE 1: Model Training     │
                  │  (03_RF_Model.ipynb)          │
                  │                              │
                  │  ClinVar Dataset             │
                  │       ↓                      │
                  │  Feature Engineering         │
                  │       ↓                      │
                  │  Random Forest Training      │
                  │       ↓                      │
                  │  rf_ann_model.pkl  ────────────────┐
                  └──────────────────────────────┘     │
                                                       │
                  ┌──────────────────────────────┐     │
                  │  PHASE 2: Annotation &       │     │
                  │  Prediction                  │     │
                  │  (04_patient_file_annotation) │     │
                  │                              │     │
                  │  Raw VCF                     │     │
                  │    ↓  bcftools norm + sort    │     │
                  │  Normalized VCF.gz           │     │
                  │    ↓  SnpEff GRCh38.86       │     │
                  │  Annotated VCF.gz            │     │
                  │    ↓  cyvcf2 parsing         │     │
                  │  Parsed DataFrame            │     │
                  │    ↓  Load model ◄────────────────┘
                  │  Pathogenicity Predictions   │
                  │    ↓                         │
                  │  Top 20 Pathogenic Variants  │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │  PHASE 3: Disease Mapping    │
                  │  & Diagnosis                 │
                  │  (05_disease_mapping_pipeline)│
                  │                              │
                  │  Orphanet XML → Gene→Disease │
                  │  Orphanet XML → Disease→HPO  │
                  │  HPO JSON    → ID→Name       │
                  │       ↓                      │
                  │  Disease Mapping Table       │
                  │       ↓                      │
                  │  Symptom Cross-Check         │
                  │       ↓                      │
                  │  Disease Likelihood Scoring  │
                  │       ↓                      │
                  │  Clinical PDF Report         │
                  └──────────────────────────────┘
```

---

## Notebooks

### `03_RF_Model.ipynb` — Random Forest Model Training

Trains a **Random Forest classifier** on the ClinVar annotated dataset to learn which genomic variants are **pathogenic** vs **benign**.

### `04_patient_file_annotation.ipynb` — Patient VCF Annotation & Prediction

Takes a **raw patient VCF file**, normalizes it, annotates it with **SnpEff**, parses the annotations, and runs the trained model to **predict pathogenicity** for every variant.

### `05_disease_mapping_pipeline.ipynb` — Disease Mapping & Clinical Report

Maps predicted **pathogenic variants to diseases** using Orphanet, cross-references with **HPO phenotypes**, optionally matches against **patient-reported symptoms**, computes a **disease likelihood score**, and generates a **clinical PDF report**.

---

## Required Input Files

### Primary Input

| File | Description | Format |
|------|-------------|--------|
| **Patient VCF file** | The raw variant call format file from genome sequencing | `.vcf` |


### System Tools

| Tool | Purpose | Install Command |
|------|---------|----------------|
| **bcftools** | VCF normalization, sorting, compression | `sudo apt-get install -y bcftools tabix` |
| **tabix** | VCF indexing | (installed with bcftools) |
| **Java (JRE)** | Required to run SnpEff | Pre-installed on Colab |
| **SnpEff** | Variant effect annotation (using `GRCh38.86` database) | Download from [SnpEff website](https://pcingola.github.io/SnpEff/) |

### Python Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `pandas` | latest | Data manipulation |
| `numpy` | latest | Numerical operations |
| `scikit-learn` | latest | Random Forest model, preprocessing, metrics |
| `joblib` | latest | Model serialization (save/load `.pkl`) |
| `cyvcf2` | latest | High-performance VCF parsing |
| `matplotlib` | latest | Confusion matrix, ROC curve plots |
| `reportlab` | latest | PDF report generation |

### Trained Model (generated by Phase 1)

| File | Path | Description |
|------|------|-------------|
| `rf_ann_model.pkl` | `models/rf_ann_model.pkl` | Serialized scikit-learn pipeline (preprocessor + Random Forest) |

---

## Step-by-Step Pipeline Walkthrough

### Phase 1 — Model Training (`03_RF_Model.ipynb`)

> **Run once.** After training, the model is saved and reused for all patients.

| Step | Action | Details |
|------|--------|---------|
| **1.1** | **Load ClinVar Dataset** | Read `clinvar_final_annotated.csv` containing pre-annotated ClinVar variants |
| **1.2** | **Feature Engineering** | Create `REF_len` and `ALT_len` (lengths of REF/ALT alleles). Convert `CLNSIG` to binary target: `1` = Pathogenic, `0` = Benign |
| **1.3** | **Select Features** | Final feature set: `CHROM`, `POS`, `REF_len`, `ALT_len`, `Effect`, `Impact`, `Transcript_BioType` |
| **1.4** | **Preprocessing** | One-hot encode categorical features (`CHROM`, `Effect`, `Impact`, `Transcript_BioType`). Pass through numerical features (`POS`, `REF_len`, `ALT_len`) |
| **1.5** | **Train/Test Split** | 80/20 split, stratified by target label |
| **1.6** | **Train Random Forest** | `n_estimators=500`, `max_depth=25`, `class_weight={0: 1.0, 1: 0.8}` |
| **1.7** | **Evaluate** | Compute Accuracy, Precision, Recall, F1, ROC-AUC. Generate confusion matrix & ROC curve |
| **1.8** | **Save Model** | Export as `rf_ann_model.pkl` using joblib |

**Features used by the model:**

```
Categorical (One-Hot Encoded):     Numerical (Passthrough):
├── CHROM                          ├── POS
├── Effect                         ├── REF_len
├── Impact                         └── ALT_len
└── Transcript_BioType
```

---

### Phase 2 — Patient VCF Annotation & Prediction (`04_patient_file_annotation.ipynb`)

> **Run for each new patient VCF file.**

| Step | Action | Details |
|------|--------|---------|
| **2.1** | **Load Raw Patient VCF** | Copy the patient `.vcf` file to the working directory |
| **2.2** | **Normalize VCF** | Run `bcftools norm -m -any` to split multi-allelic sites into separate records, then sort and compress with `bcftools sort -Oz` |
| **2.3** | **Index VCF** | Run `tabix -p vcf` to create `.tbi` index for the compressed VCF |
| **2.4** | **Annotate with SnpEff** | Run `snpEff.jar GRCh38.86` to annotate each variant with predicted effects (e.g., missense, frameshift), impact level, gene name, and transcript biotype |
| **2.5** | **Compress & Index** | `bgzip` + `tabix` the annotated VCF |
| **2.6** | **Parse Annotated VCF** | Use `cyvcf2` to extract `ANN` field from each variant. Parse: `Effect`, `Impact`, `GeneName`, `Transcript_BioType` |
| **2.7** | **Create ML Features** | Compute `REF_len` and `ALT_len` from the REF/ALT allele strings |
| **2.8** | **Load Trained Model** | Load `rf_ann_model.pkl` via joblib |
| **2.9** | **Predict Pathogenicity** | Run `model.predict()` for binary classification (0=Benign, 1=Pathogenic) and `model.predict_proba()` for probability scores |
| **2.10** | **Save Results** | Export full variant predictions CSV and top 20 most pathogenic variants CSV |

**SnpEff ANN field parsing:**

```
ANN=T|missense_variant|MODERATE|MECP2|...|protein_coding|...
      ↑               ↑        ↑                ↑
    Effect          Impact   GeneName      Transcript_BioType
   (field 1)      (field 2) (field 3)       (field 7)
```

---

### Phase 3 — Disease Mapping & Symptom Scoring (`05_disease_mapping_pipeline.ipynb`)

> **Run after Phase 2 to generate the diagnosis.**

| Step | Action | Details |
|------|--------|---------|
| **3.1** | **Load Predictions** | Read `patient1_top20_pathogenic.csv`, filter for predicted pathogenic variants (`Prediction == 1`) |
| **3.2** | **Orphanet Gene → Disease** | Parse `disease_gene_associations.xml` to build a `gene_symbol → [diseases]` lookup dictionary |
| **3.3** | **Orphanet Disease → HPO** | Parse `disease_phenotype.xml` to build a `disease_name → [HPO IDs]` lookup dictionary |
| **3.4** | **HPO ID → Name** | Parse `hp.json` to build a `HPO_ID → human-readable name` lookup dictionary |
| **3.5** | **Build Disease Mapping Table** | For each pathogenic variant, look up its gene → associated diseases → associated phenotypes (symptoms). Merge into a single DataFrame |
| **3.6** | **Symptom Cross-Check** *(optional)* | Input patient-reported symptoms (e.g., `["breast swelling", "breast Pain", ...]`). Match against each disease's HPO phenotype list |
| **3.7** | **Compute Disease Likelihood Score** | Weighted formula combining multiple signals (see below) |
| **3.8** | **Generate Clinical PDF Report** | Create a formatted PDF with summary, top 5 diagnoses, top pathogenic variants, and symptom matches |
| **3.9** | **Save All Outputs** | Export disease mapping CSV, symptom-ranked diseases CSV, and clinical PDF |

**Disease Likelihood Scoring Formula:**

```
DiseaseLikelihoodScore = α × ML_Probability
                       + β × MatchFraction
                       + γ × (VariantCount / 5)
                       + δ × ImpactWeight

Where:
  α = 0.50  (ML pathogenicity probability weight)
  β = 0.35  (symptom match fraction weight)
  γ = 0.10  (number of supporting variants weight)
  δ = 0.05  (variant impact severity weight)

Impact Weights:
  HIGH     = 1.0
  MODERATE = 0.7
  LOW      = 0.3
  MODIFIER = 0.1
```

---

## Dependencies & Installation

### Install System Tools (on Google Colab / Ubuntu)

```bash
sudo apt-get update
sudo apt-get install -y bcftools tabix
```

### Install Python Packages

```bash
pip install pandas numpy scikit-learn joblib cyvcf2 matplotlib reportlab
```

### Download SnpEff

```bash
# Download SnpEff (place in tools/snpEff/)
wget https://snpeff.blob.core.windows.net/versions/snpEff_latest_core.zip
unzip snpEff_latest_core.zip

# Download the GRCh38.86 database
java -jar snpEff/snpEff.jar download GRCh38.86
```

### Download External Databases

| Database | Source | Files Needed |
|----------|--------|-------------|
| **Orphanet** | [orphadata.com](https://www.orphadata.com/) | `disease_gene_associations.xml`, `disease_phenotype.xml` |
| **HPO** | [hpo.jax.org](https://hpo.jax.org/data/annotations) | `phenotype.hpoa`, `hp.json` |
