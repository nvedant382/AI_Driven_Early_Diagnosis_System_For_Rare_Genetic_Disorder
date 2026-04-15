# 🧬 VCF Genomic Prediction Pipeline & Web Platform

Welcome to the **VCF Genomic Prediction Pipeline**, an advanced, full-stack bioinformatics application built to analyze human genomic data in the form of Variant Call Format (VCF) files. 

This project aims to bridge the gap between complex genomic data and human-readable clinical insights. By combining a **React Frontend**, a **Flask Backend**, and a highly-trained **Machine Learning Model (Random Forest)**, this platform predicts the pathogenicity (danger level) of genetic mutations and cross-references them with actual patient symptoms to suggest possible diseases.

---

## 🌟 What This Project Does (In Simple Terms)

Imagine downloading a gigantic text file containing all the genetic mutations a person has. It's almost impossible for a doctor to read through millions of mutations to find the *one* causing a rare disease. 

This platform acts as an **AI-powered genetic detective**:
1. **You upload a file:** A `.vcf` file containing the patient's genetic sequence differences.
2. **You provide symptoms:** (Optional) What the patient is experiencing (e.g., headache, seizures).
3. **The engine normalizes & annotates it:** It translates raw codes into meaningful biological context (e.g., "This mutation stops a protein from forming").
4. **The AI predicts danger:** A trained Random Forest model looks at the labeled mutations and predicts which ones are most likely disease-causing (pathogenic).
5. **Disease Matching:** The system links those dangerous mutations to specific genes, and then to known rare diseases (using a database called Orphanet), and ranks them based on the patient's symptoms (using Human Phenotype Ontology, HPO).
6. **The Result:** A clean, easy-to-read clinical report showing the top most-likely diseases and the exact genetic mutations causing them.

---

## 🏗️ Project Architecture & Folders

This repository is split into 4 main areas:

### 1. `frontend/` (The User Interface)
- Built with **React** and **Vite**.
- This is the face of the application where doctors and researchers register, log in, upload their VCF files, type in patient symptoms, and view beautiful, structured diagnostic reports.

### 2. `backend/` (The Brains / API)
- Built with **Python Flask**.
- Handles user authentication (login/register via SQLite `users.db`).
- Contains the `app.py` script which receives the uploaded file and orchestrates the heavy lifting: running terminal tools, executing the AI model, and compiling the final JSON report sent back to the frontend.

### 3. `Bioinformatics/` (The Data Warehouse)
- Contains the massive external databases and annotation tools necessary for genome processing. 
- Includes **SnpEff** (to annotate mutations) and mapping data from **Orphanet** (gene-to-disease databases) and **HPO** (disease-to-symptom databases).

### 4. `model-pipeline/` (The AI Laboratory)
- Contains Jupyter Notebooks (`.ipynb`) used by Data Scientists to initially build and train the Machine Learning model. 
- You do *not* need to run these to use the app. They exist to show *how* the AI model `rf_ann_model.pkl` was created using real-world ClinVar data.

---

## 🔬 How the Pipeline Works: Step-by-Step Deep Dive

When you press "Predict" on the frontend, a lot happens in the backend (`app.py`). Here is the journey of your file:

### Step 1: Normalization (`bcftools`)
Genomic data can be messy. Sometimes a single mutation is written in multiple ways. We use a bioinformatics tool called **bcftools** to "normalize" the VCF. This ensures every mutation is formatted following a strict universal standard so our AI won't get confused.

### Step 2: Annotation (`SnpEff`)
A standard VCF just says: "At position 100 on Chromosome 1, the letter A changed to a G." 
That's not enough! We run the file through **SnpEff**, a program that looks at the human genome dictionary (GRCh38) and adds context: "This A to G change happened *inside* gene XYZ, and it causes the protein to break." This is called annotation.

### Step 3: AI Prediction (The Random Forest Model)
Now that the mutations are annotated, we parse them using a fast tool called `cyvcf2` and pass them into our pre-trained AI Model (`rf_ann_model.pkl`). The AI looks at hundreds of features for every mutation and assigns a **Pathology Score** (e.g., 99% pathogenic). 

### Step 4: Disease & Symptom Mapping
We grab the top most pathogenic mutations and find out which genes they belong to. 
- **Orphanet Database:** Tells us "Mutations in Gene XYZ cause Disease ABC."
- **HPO Database:** Tells us "Disease ABC usually features seizures and headaches."
- **Scoring System:** We compare the patient's *actual* symptoms to the disease's *known* symptoms. If there’s a strong match, that disease gets boosted to the top of the ranking.

### Step 5: The Final Report
The backend bundles the top 5 predicted diseases, the exact causative variants, and the symptom overlap scores into a neat package and sends it to the frontend for the user to read.

---

## ⚙️ How to Setup & Run the Project locally

Because this project runs heavy genomic tools, you need a few prerequisites installed on your computer (preferably Linux or macOS, or WSL on Windows).

### Prerequisites
1. **Java (JRE)**: Needed to run the SnpEff annotation tool.
2. **Python 3.8+**: Needed for the backend AI processing.
3. **Node.js 18+**: Needed to run the React frontend.
4. **bcftools & tabix**: Command-line genomic tools.
   - *Ubuntu/Debian:* `sudo apt-get install -y bcftools tabix`
   - *Mac (Homebrew):* `brew install bcftools`

### Backend Setup (Flask API)
1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. *(Optional but crucial)* Ensure the databases in the `Bioinformatics/` folder are properly downloaded. You'll need the `GRCh38.86` database inside the SnpEff tools folder.
4. Run the Flask Server:
   ```bash
   python app.py
   ```
   *The backend will now be running on `http://127.0.0.1:5000`*

### Frontend Setup (React Application)
1. Open a new, separate terminal and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install Node modules:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The frontend will now be running (usually on `http://localhost:5173`).*

---

## 🚀 Usage Guide

1. Open your browser and go to the frontend URL (e.g., `http://localhost:5173`).
2. **Register/Login** to a new account using the UI interface to securely access the platform.
3. Once logged in, go to the Prediction/Upload section.
4. **Upload a `.vcf` file** (Note: Very large files take time to process, consider using shortened patient sample files for testing).
5. **Type in Symptoms** as a JSON list (e.g., `["seizures", "muscle weakness"]`).
6. Hit **Submit!**
7. Wait while the backend performs normalization, annotation, prediction, and mapping. The final page will display a beautiful report of the Top 5 Predicted Rare Diseases based on the patient's genetic sequence.

---

> Built with ❤️ to solve the mysteries of the human genome and improve clinical diagnostics through Artificial Intelligence.
