import React, { useState, useEffect } from 'react';

function Report({ data, onNewAnalysis, onLogout, user }) {
    const { summary, top5Diagnoses, keyVariants, totalVariantsParsed } = data;
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

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
                    <button onClick={onNewAnalysis} className="new-analysis-btn">
                        ← New Analysis
                    </button>
                    <span className="user-greeting">Hi, {user?.username}</span>
                    <button onClick={toggleTheme} className="theme-toggle" title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} id="theme-toggle">
                        <span className="theme-toggle-thumb" />
                    </button>
                    <button onClick={onLogout} className="header-logout-btn">Sign Out</button>
                </div>
            </header>

            <main className="report-main">
                {/* Title */}
                <div className="report-title-section">
                    <h1 className="report-title">Clinical Genomic Diagnosis Report</h1>
                    <p className="report-date">
                        Generated on {new Date().toLocaleDateString('en-US', {
                            year: 'numeric', month: 'long', day: 'numeric'
                        })}
                    </p>
                </div>

                {/* ═══ Summary Cards ═══ */}
                <section className="summary-section">
                    <div className="section-header">
                        <span className="section-icon">📋</span>
                        <div><h2>Summary</h2></div>
                    </div>
                    <div className="summary-grid">
                        {/* Primary diagnosis card */}
                        <div className="summary-card primary-card" id="summary-diagnosis">
                            <div className="card-label">Most Likely Diagnosis</div>
                            <div className="card-value diagnosis-value">{summary.mostLikelyDiagnosis}</div>
                            <div className="card-sub">
                                Responsible Gene: <strong>{summary.responsibleGene}</strong>
                            </div>
                        </div>

                        {/* Score */}
                        <div className="summary-card" id="summary-score">
                            <div className="card-label">Likelihood Score</div>
                            <div className="card-value score-value">
                                {typeof summary.likelihoodScore === 'number'
                                    ? summary.likelihoodScore.toFixed(3)
                                    : summary.likelihoodScore}
                            </div>
                            <div className="score-bar-bg">
                                <div className="score-bar-fill" style={{
                                    width: `${Math.min((summary.likelihoodScore || 0) * 100, 100)}%`
                                }} />
                            </div>
                        </div>

                        {/* Pathogenic variants count */}
                        <div className="summary-card" id="summary-variants">
                            <div className="card-label">Pathogenic Variants</div>
                            <div className="card-value number-value">{summary.totalPathogenicVariants}</div>
                            <div className="card-sub">
                                out of {totalVariantsParsed || '—'} total variants parsed
                            </div>
                        </div>

                        {/* Symptoms */}
                        <div className="summary-card" id="summary-symptoms">
                            <div className="card-label">Symptoms Provided</div>
                            <div className="card-value number-value">{summary.symptomsProvided?.length || 0}</div>
                            <div className="card-sub symptoms-list-mini">
                                {summary.symptomsProvided?.length > 0
                                    ? summary.symptomsProvided.join(', ')
                                    : 'None'}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ═══ Top 5 Diagnoses ═══ */}
                <section className="diagnoses-section">
                    <div className="section-header">
                        <span className="section-icon">🏥</span>
                        <div><h2>Top 5 Likely Diagnoses</h2></div>
                    </div>
                    <div className="diagnoses-table-wrapper">
                        <table className="diagnoses-table" id="diagnoses-table">
                            <thead>
                                <tr>
                                    <th className="rank-col">#</th>
                                    <th>Disease</th>
                                    <th>Gene</th>
                                    <th className="score-col">DiseaseLikelihoodScore</th>
                                </tr>
                            </thead>
                            <tbody>
                                {top5Diagnoses.map((d, i) => (
                                    <tr key={i} className={i === 0 ? 'top-row' : ''}>
                                        <td className="rank-col">
                                            <span className={`rank-badge ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : ''}`}>
                                                {i + 1}
                                            </span>
                                        </td>
                                        <td className="disease-name">{d.disease}</td>
                                        <td><span className="gene-badge">{d.gene}</span></td>
                                        <td className="score-col">
                                            <div className="score-cell">
                                                <span className="score-number">{d.score}</span>
                                                <div className="mini-bar-bg">
                                                    <div className="mini-bar-fill" style={{
                                                        width: `${Math.min(d.score * 100, 100)}%`
                                                    }} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ═══ Key Pathogenic Variants ═══ */}
                <section className="variants-section">
                    <div className="section-header">
                        <span className="section-icon">🧪</span>
                        <div><h2>Key Pathogenic Variants</h2></div>
                    </div>
                    <div className="variants-grid">
                        {keyVariants.map((v, i) => (
                            <div key={i} className="variant-card" id={`variant-${i}`}>
                                <div className="variant-header">
                                    <span className="variant-location">{v.location}</span>
                                    <span className={`impact-badge impact-${(v.impact || '').toLowerCase()}`}>
                                        {v.impact}
                                    </span>
                                </div>
                                <div className="variant-change">
                                    <code>{v.change}</code>
                                </div>
                                <div className="variant-details">
                                    <div className="detail-row">
                                        <span className="detail-label">Gene</span>
                                        <span className="detail-value">{v.gene}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">Effect</span>
                                        <span className="detail-value">{v.effect}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">Probability</span>
                                        <span className="detail-value probability-value">
                                            {(v.probability * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="variant-prob-bar">
                                    <div className="variant-prob-fill" style={{
                                        width: `${Math.min(v.probability * 100, 100)}%`
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ═══ Symptoms Provided ═══ */}
                {summary.symptomsProvided?.length > 0 && (
                    <section className="symptoms-provided-section">
                        <div className="section-header">
                            <span className="section-icon">🩺</span>
                            <div><h2>Symptoms Provided</h2></div>
                        </div>
                        <div className="provided-symptoms-chips">
                            {summary.symptomsProvided.map((s, i) => (
                                <span key={i} className="provided-chip">{s}</span>
                            ))}
                        </div>
                    </section>
                )}

                {/* ═══ Disclaimer ═══ */}
                <div className="report-disclaimer">
                    <p>
                        <strong>⚠️ Disclaimer:</strong> This report is generated by an AI/ML pipeline for
                        research and educational purposes only. It should <em>not</em> be used as a
                        substitute for professional medical advice, diagnosis, or treatment.
                        Always consult with a qualified healthcare professional.
                    </p>
                </div>
            </main>
        </div>
    );
}

export default Report;
