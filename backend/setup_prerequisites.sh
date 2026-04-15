#!/bin/bash
# Setup script for VCF Pipeline prerequisites
# Run: chmod +x setup_prerequisites.sh && ./setup_prerequisites.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BIO_DIR="$PROJECT_DIR/Bioinformatics"
SNPEFF_DIR="$BIO_DIR/tools/snpEff"
ORPHANET_DIR="$BIO_DIR/data/external/orphanet"
HPO_DIR="$BIO_DIR/data/external/hpo"

echo "=== VCF Pipeline Setup ==="
echo ""

# 1. Install bcftools & htslib (provides tabix, bgzip)
echo "[1/4] Checking bcftools, tabix, bgzip..."
if ! command -v bcftools &>/dev/null || ! command -v tabix &>/dev/null; then
    echo "  Installing bcftools and htslib via Homebrew..."
    brew install bcftools htslib
else
    echo "  ✅ bcftools and htslib already installed"
fi

# 2. Download snpEff.jar if missing
echo "[2/4] Checking snpEff.jar..."
if [ ! -f "$SNPEFF_DIR/snpEff.jar" ]; then
    echo "  Downloading snpEff..."
    cd /tmp
    curl -L -o snpEff_latest_core.zip https://snpeff.blob.core.windows.net/versions/snpEff_latest_core.zip
    unzip -o snpEff_latest_core.zip
    cp snpEff/snpEff.jar "$SNPEFF_DIR/snpEff.jar"
    cp snpEff/snpEff.config "$SNPEFF_DIR/snpEff.config" 2>/dev/null || true
    # Copy lib directory if exists
    if [ -d "snpEff/lib" ]; then
        cp -r snpEff/lib "$SNPEFF_DIR/"
    fi
    rm -rf snpEff snpEff_latest_core.zip
    echo "  ✅ snpEff.jar downloaded"
else
    echo "  ✅ snpEff.jar already exists"
fi

# 3. Download Orphanet XMLs
echo "[3/4] Checking Orphanet data..."
mkdir -p "$ORPHANET_DIR"
if [ ! -f "$ORPHANET_DIR/disease_gene_associations.xml" ]; then
    echo "  Downloading Orphanet gene-disease associations..."
    curl -L -o "$ORPHANET_DIR/disease_gene_associations.xml" \
        "https://www.orphadata.com/data/xml/en_product6.xml"
    echo "  ✅ disease_gene_associations.xml downloaded"
else
    echo "  ✅ disease_gene_associations.xml exists"
fi

if [ ! -f "$ORPHANET_DIR/disease_phenotype.xml" ]; then
    echo "  Downloading Orphanet disease-phenotype associations..."
    curl -L -o "$ORPHANET_DIR/disease_phenotype.xml" \
        "https://www.orphadata.com/data/xml/en_product4.xml"
    echo "  ✅ disease_phenotype.xml downloaded"
else
    echo "  ✅ disease_phenotype.xml exists"
fi

# 4. Download HPO data
echo "[4/4] Checking HPO data..."
mkdir -p "$HPO_DIR"
if [ ! -f "$HPO_DIR/hp.json" ]; then
    echo "  Downloading HPO ontology JSON..."
    curl -L -o "$HPO_DIR/hp.json" \
        "https://raw.githubusercontent.com/obophenotype/human-phenotype-ontology/master/hp.json"
    echo "  ✅ hp.json downloaded"
else
    echo "  ✅ hp.json exists"
fi

if [ ! -f "$HPO_DIR/phenotype.hpoa" ]; then
    echo "  Downloading HPO annotations..."
    curl -L -o "$HPO_DIR/phenotype.hpoa" \
        "https://purl.obolibrary.org/obo/hp/hpoa/phenotype.hpoa"
    echo "  ✅ phenotype.hpoa downloaded"
else
    echo "  ✅ phenotype.hpoa exists"
fi

echo ""
echo "=== Setup Complete ==="
echo "Model:    $(ls -lh "$SCRIPT_DIR/model/rf_ann_model.pkl" 2>/dev/null | awk '{print $5}' || echo 'MISSING')"
echo "snpEff:   $(ls "$SNPEFF_DIR/snpEff.jar" 2>/dev/null && echo 'OK' || echo 'MISSING')"
echo "Orphanet: $(ls "$ORPHANET_DIR"/*.xml 2>/dev/null | wc -l | tr -d ' ') files"
echo "HPO:      $(ls "$HPO_DIR"/* 2>/dev/null | wc -l | tr -d ' ') files"
echo ""
echo "Next: cd backend && pip install -r requirements.txt && python3 app.py"
