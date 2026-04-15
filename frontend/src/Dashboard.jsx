import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Report from './Report';
import './Dashboard.css';

const SYMPTOM_CATEGORIES = {
    "Breast & Chest": [
        "Breast swelling", "Breast pain", "Breast lump",
        "Nipple discharge", "Chest pain", "Breast asymmetry"
    ],
    "Skin & Appearance": [
        "Skin redness", "Skin rash", "Jaundice",
        "Pale skin", "Easy bruising", "Skin lesion"
    ],
    "Systemic": [
        "Weight loss", "Fatigue", "Fever",
        "Night sweats", "Loss of appetite", "Malaise"
    ],
    "Neurological": [
        "Headache", "Seizures", "Muscle weakness",
        "Numbness", "Vision changes", "Cognitive decline"
    ],
    "Gastrointestinal": [
        "Abdominal pain", "Nausea", "Vomiting",
        "Diarrhea", "Constipation", "Blood in stool"
    ],
    "Respiratory": [
        "Shortness of breath", "Chronic cough", "Wheezing",
        "Coughing blood", "Chest tightness", "Frequent infections"
    ],
    "Musculoskeletal": [
        "Joint pain", "Bone pain", "Swollen joints",
        "Muscle cramps", "Back pain", "Fractures"
    ],
    "Cardiovascular": [
        "Palpitations", "Dizziness", "Fainting",
        "Swollen legs", "High blood pressure", "Irregular heartbeat"
    ]
};

function Dashboard({ user, onLogout }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [selectedSymptoms, setSelectedSymptoms] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [reportData, setReportData] = useState(null);
    const [error, setError] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
    const fileInputRef = useRef(null);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.vcf')) {
                setSelectedFile(file);
                setError('');
            } else {
                setError('Please upload a .vcf file');
            }
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
            setError('');
        }
    };

    const toggleSymptom = (symptom) => {
        setSelectedSymptoms(prev =>
            prev.includes(symptom)
                ? prev.filter(s => s !== symptom)
                : [...prev, symptom]
        );
    };

    const handleAnalyze = async () => {
        if (!selectedFile) {
            setError('Please upload a VCF file first');
            return;
        }

        setIsLoading(true);
        setError('');
        setReportData(null);

        const messages = [
            'Uploading VCF file...',
            'Normalizing variants with bcftools...',
            'Annotating with SnpEff GRCh38.86...',
            'Parsing variant annotations...',
            'Running pathogenicity prediction model...',
            'Mapping genes to diseases (Orphanet)...',
            'Cross-checking symptoms with HPO...',
            'Computing disease likelihood scores...',
            'Generating clinical report...'
        ];

        let msgIndex = 0;
        setLoadingMessage(messages[0]);
        const interval = setInterval(() => {
            msgIndex = Math.min(msgIndex + 1, messages.length - 1);
            setLoadingMessage(messages[msgIndex]);
        }, 4000);

        try {
            const formData = new FormData();
            formData.append('vcf_file', selectedFile);
            formData.append('symptoms', JSON.stringify(selectedSymptoms));

            const response = await axios.post('http://localhost:5000/api/predict', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 1800000 // 30 min timeout for large VCFs
            });

            setReportData(response.data);
        } catch (err) {
            const errMsg = err.response?.data?.error || err.message || 'Analysis failed';
            setError(errMsg);
        } finally {
            clearInterval(interval);
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    const handleNewAnalysis = () => {
        setReportData(null);
        setSelectedFile(null);
        setSelectedSymptoms([]);
        setError('');
    };

    // ── Report View ──
    if (reportData) {
        return (
            <Report
                data={reportData}
                onNewAnalysis={handleNewAnalysis}
                onLogout={onLogout}
                user={user}
            />
        );
    }

    // ── Loading View ──
    if (isLoading) {
        return (
            <div className="dashboard-container">
                <div className="loading-overlay">
                    <div className="loading-card">
                        <div className="dna-loader">
                            <div className="helix">
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="helix-dot" style={{ animationDelay: `${i * 0.15}s` }} />
                                ))}
                            </div>
                        </div>
                        <h2 className="loading-title">Analyzing Genome</h2>
                        <p className="loading-message">{loadingMessage}</p>
                        <div className="loading-progress">
                            <div className="loading-bar" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Dashboard View ──
    return (
        <div className="dashboard-container">
            {/* Header */}
            <header className="dashboard-header">
                <div className="header-left">
                    <div className="logo-icon">🧬</div>
                    <div>
                        <h1 className="app-title">GeneHelix</h1>
                        <p className="app-subtitle">Clinical Genomic Analysis</p>
                    </div>
                </div>
                <div className="header-right">
                    <span className="user-greeting">Hi, {user?.username}</span>
                    <button onClick={toggleTheme} className="theme-toggle" title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} id="theme-toggle">
                        <span className="theme-toggle-thumb" />
                    </button>
                    <button onClick={onLogout} className="header-logout-btn">Sign Out</button>
                </div>
            </header>

            <main className="dashboard-main">
                {/* VCF Upload Section */}
                <section className="upload-section">
                    <div className="section-header">
                        <span className="section-icon">📄</span>
                        <div>
                            <h2>Upload VCF File</h2>
                            <p>Drag & drop or select your Variant Call Format file</p>
                        </div>
                    </div>

                    <div
                        className={`drop-zone ${dragActive ? 'active' : ''} ${selectedFile ? 'has-file' : ''}`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".vcf"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                            id="vcf-file-input"
                        />

                        {selectedFile ? (
                            <div className="file-selected">
                                <div className="file-icon">✅</div>
                                <div className="file-info">
                                    <span className="file-name">{selectedFile.name}</span>
                                    <span className="file-size">
                                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                                    </span>
                                </div>
                                <button
                                    className="remove-file"
                                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                                >
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <div className="drop-prompt">
                                <div className="upload-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                </div>
                                <p className="drop-text">Drop your <strong>.vcf</strong> file here</p>
                                <p className="drop-hint">or click to browse</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* Symptoms Section */}
                <section className="symptoms-section">
                    <div className="section-header">
                        <span className="section-icon">🩺</span>
                        <div>
                            <h2>Select Symptoms</h2>
                            <p>Choose symptoms to improve diagnosis accuracy
                                {selectedSymptoms.length > 0 && (
                                    <span className="symptom-count"> — {selectedSymptoms.length} selected</span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="symptoms-grid">
                        {Object.entries(SYMPTOM_CATEGORIES).map(([category, symptoms]) => (
                            <div key={category} className="symptom-category">
                                <h3 className="category-title">{category}</h3>
                                <div className="symptom-chips">
                                    {symptoms.map(symptom => (
                                        <button
                                            key={symptom}
                                            className={`symptom-chip ${selectedSymptoms.includes(symptom) ? 'selected' : ''}`}
                                            onClick={() => toggleSymptom(symptom)}
                                            id={`symptom-${symptom.replace(/\s+/g, '-').toLowerCase()}`}
                                        >
                                            <span className="chip-check">
                                                {selectedSymptoms.includes(symptom) ? '✓' : '+'}
                                            </span>
                                            {symptom}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Error */}
                {error && (
                    <div className="error-banner">
                        <span className="error-icon">⚠️</span>
                        <p>{error}</p>
                    </div>
                )}

                {/* Analyze Button */}
                <div className="analyze-section">
                    <button
                        className="analyze-btn"
                        onClick={handleAnalyze}
                        disabled={!selectedFile}
                        id="analyze-button"
                    >
                        <svg className="btn-icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                        Run Genomic Analysis
                    </button>
                    <p className="analyze-note">
                        Analysis may take several minutes depending on VCF file size
                    </p>
                </div>
            </main>
        </div>
    );
}

export default Dashboard;
