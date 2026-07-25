import React, { useState, useEffect } from "react";
import { FileText, Target, Sparkles, ChevronRight, AlertCircle, CheckCircle2, TrendingUp, History, Save, Trash2, X, Upload, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// --- PDF text extraction (uses pdf.js loaded from CDN, no bundler config needed) ---
let pdfjsLoadPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsLoadPromise) return pdfjsLoadPromise;
  pdfjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Could not load PDF reader."));
    document.head.appendChild(script);
  });
  return pdfjsLoadPromise;
}

async function extractTextFromPdf(file) {
  const pdfjsLib = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it) => it.str).join(" ");
    fullText += pageText + "\n\n";
  }
  return fullText.trim();
}

// --- DOCX text extraction (uses mammoth.js loaded from CDN) ---
let mammothLoadPromise = null;
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (mammothLoadPromise) return mammothLoadPromise;
  mammothLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.7.2/mammoth.browser.min.js";
    script.onload = () => resolve(window.mammoth);
    script.onerror = () => reject(new Error("Could not load Word document reader."));
    document.head.appendChild(script);
  });
  return mammothLoadPromise;
}

async function extractTextFromDocx(file) {
  const mammoth = await loadMammoth();
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return (result.value || "").trim();
}

const ACCEPTED_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

function getFileKind(file) {
  if (ACCEPTED_TYPES[file.type]) return ACCEPTED_TYPES[file.type];
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".doc")) return "doc-legacy";
  return null;
}

const SAMPLE_RESUME = `Aashish Kumar
Software Engineer

EXPERIENCE
Built internal tools using Python and REST APIs.
Worked with a team to fix bugs in a web application.
Helped deploy updates to production servers.

SKILLS
Python, JavaScript, SQL, Git`;

const SAMPLE_JD = `We are hiring a Software Engineer (AI Applications) to build and ship
LLM-powered products. You will design agentic workflows using the Claude API,
integrate MCP tools, own features end-to-end, and collaborate with product
and design. Requirements: 2+ years professional experience, strong Python,
experience with REST/GraphQL APIs, familiarity with prompt engineering and
LLM evaluation, comfort working in ambiguous, fast-moving environments.`;

export default function App() {
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("analyze"); // 'analyze' | 'history'
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [roleLabel, setRoleLabel] = useState("");
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [resumeFileName, setResumeFileName] = useState(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const list = await window.storage.list("run:");
      if (!list || !list.keys || list.keys.length === 0) {
        setHistory([]);
        setHistoryLoading(false);
        return;
      }
      const entries = [];
      for (const key of list.keys) {
        try {
          const rec = await window.storage.get(key);
          if (rec) entries.push(JSON.parse(rec.value));
        } catch (e) {
          // skip unreadable entry
        }
      }
      entries.sort((a, b) => a.timestamp - b.timestamp);
      setHistory(entries);
    } catch (e) {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveRun = async (parsed) => {
    const entry = {
      id: `run_${Date.now()}`,
      timestamp: Date.now(),
      role: roleLabel.trim() || "Untitled role",
      match_score: parsed.match_score,
      verdict: parsed.verdict,
      missing_count: (parsed.missing_keywords || []).length,
    };
    try {
      await window.storage.set(`run:${entry.id}`, JSON.stringify(entry));
      setHistory((h) => [...h, entry].sort((a, b) => a.timestamp - b.timestamp));
    } catch (e) {
      // non-fatal — analysis still shows even if save fails
    }
  };

  const deleteRun = async (id) => {
    try {
      await window.storage.delete(`run:${id}`);
      setHistory((h) => h.filter((e) => e.id !== id));
    } catch (e) {
      // non-fatal
    }
  };

  const handleResumeUpload = async (file) => {
    if (!file) return;
    const kind = getFileKind(file);

    if (kind === "doc-legacy") {
      setPdfError("The old .doc format isn't supported. Please save it as .docx or .pdf and try again.");
      return;
    }
    if (!kind) {
      setPdfError("Unsupported file type. Please upload a PDF or Word (.docx) file.");
      return;
    }

    setPdfError(null);
    setPdfParsing(true);
    try {
      const text = kind === "pdf" ? await extractTextFromPdf(file) : await extractTextFromDocx(file);
      if (!text || text.length < 20) {
        setPdfError("Could not read text from this file. It may be a scanned image — try pasting the text instead.");
      } else {
        setResume(text);
        setResumeFileName(file.name);
      }
    } catch (e) {
      setPdfError("Couldn't read that file. Try a different one or paste the text instead.");
    } finally {
      setPdfParsing(false);
    }
  };

  const runAnalysis = async () => {
    if (!resume.trim() || !jd.trim()) {
      setError("Paste both your resume and the job description first.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);

    const systemPrompt = `You are an exacting technical recruiter and ATS system rolled into one.
Given a RESUME and a JOB DESCRIPTION, respond with ONLY valid JSON, no markdown fences, no preamble.
Schema:
{
  "match_score": <integer 0-100>,
  "verdict": "<one short sentence, direct, no fluff>",
  "missing_keywords": ["<keyword or skill from JD absent in resume>", ...up to 8],
  "matched_keywords": ["<keyword present in both>", ...up to 8],
  "weak_bullets": [
    {"original": "<a weak line pulled from the resume>", "rewrite": "<punchier, quantified, JD-aligned rewrite>"}
  ],
  "top_actions": ["<specific, concrete next step>", ...3 items]
}
Be honest and specific. Rewrites should stay truthful to the original claim, just sharper and more aligned to the JD's language.`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `RESUME:\n${resume}\n\nJOB DESCRIPTION:\n${jd}`,
            },
          ],
        }),
      });
      const data = await response.json();
      const text = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .replace(/```json|```/g, "")
        .trim();
      const parsed = JSON.parse(text);
      setResult(parsed);
      await saveRun(parsed);
    } catch (e) {
      setError("Analysis failed. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s) =>
    s >= 75 ? "#3fae6a" : s >= 50 ? "#d4a13d" : "#c1543f";

  return (
    <div style={{ minHeight: "100vh", background: "#12151c", color: "#e9e6dd", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Fraunces', serif; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        textarea { font-family: 'Inter', sans-serif; }
        textarea::placeholder { color: #6b7280; }
        .btn-primary { transition: transform 0.15s ease, background 0.15s ease; }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); background: #f0c869; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .fade-in { animation: fadeIn 0.5s ease both; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: translateY(0);} }
        .chip { transition: transform 0.12s ease; }
        .chip:hover { transform: translateY(-2px); }
        @media (prefers-reduced-motion: reduce) {
          .fade-in, .btn-primary, .chip { animation: none !important; transition: none !important; }
        }
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus-visible, textarea:focus-visible, button:focus-visible {
          outline: 2px solid #f0c869; outline-offset: 2px;
        }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #262b36", padding: "28px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: "#f0c869", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Target size={22} color="#12151c" />
          </div>
          <div>
            <div className="serif" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
              ResumeFitCheck
            </div>
            <div className="mono" style={{ fontSize: 11.5, color: "#8b91a0", marginTop: 3, letterSpacing: "0.03em" }}>
              CLAUDE-POWERED ATS SIMULATION
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "#171b24", border: "1px solid #262b36", borderRadius: 9, padding: 4 }}>
            <TabButton active={tab === "analyze"} onClick={() => setTab("analyze")} icon={<Sparkles size={14} />} label="Analyze" />
            <TabButton active={tab === "history"} onClick={() => setTab("history")} icon={<History size={14} />} label={`History${history.length ? ` (${history.length})` : ""}`} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 80px" }}>
      {tab === "history" ? (
        <HistoryView history={history} loading={historyLoading} onDelete={deleteRun} />
      ) : (
      <>
        {/* Role label + Inputs */}
        <div style={{ marginBottom: 16 }}>
          <input
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            placeholder="Label this run — e.g. 'Microsoft SWE — Aug draft'"
            className="mono"
            style={{
              width: "100%",
              background: "#171b24",
              border: "1px solid #262b36",
              borderRadius: 8,
              padding: "10px 14px",
              color: "#e9e6dd",
              fontSize: 13,
            }}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Panel
            icon={<FileText size={16} />}
            label="Your résumé"
            value={resume}
            onChange={(v) => { setResume(v); setResumeFileName(null); }}
            placeholder="Paste your resume text here, or upload a PDF/Word file..."
            onSample={() => { setResume(SAMPLE_RESUME); setResumeFileName(null); }}
            allowUpload
            onUpload={handleResumeUpload}
            uploading={pdfParsing}
            uploadError={pdfError}
            fileName={resumeFileName}
          />
          <Panel
            icon={<Target size={16} />}
            label="Target job description"
            value={jd}
            onChange={setJd}
            placeholder="Paste the job description here..."
            onSample={() => setJd(SAMPLE_JD)}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "center", margin: "28px 0" }}>
          <button
            className="btn-primary"
            onClick={runAnalysis}
            disabled={loading}
            style={{
              background: "#f0c869",
              color: "#12151c",
              border: "none",
              borderRadius: 8,
              padding: "13px 28px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Sparkles size={17} />
            {loading ? "Analyzing against the JD…" : "Run match analysis"}
          </button>
        </div>

        {error && (
          <div className="fade-in" style={{ color: "#e08a75", textAlign: "center", marginBottom: 20, fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="fade-in">
            {/* Score signature element */}
            <div
              style={{
                border: "1px solid #262b36",
                borderRadius: 14,
                padding: "32px",
                marginBottom: 24,
                background: "linear-gradient(135deg, #171b24 0%, #12151c 100%)",
                display: "flex",
                alignItems: "center",
                gap: 32,
                flexWrap: "wrap",
              }}
            >
              <ScoreDial score={result.match_score} color={scoreColor(result.match_score)} />
              <div style={{ flex: 1, minWidth: 240 }}>
                <div className="mono" style={{ fontSize: 11.5, color: "#8b91a0", letterSpacing: "0.05em", marginBottom: 8 }}>
                  MATCH VERDICT
                </div>
                <div className="serif" style={{ fontSize: 21, lineHeight: 1.4 }}>
                  {result.verdict}
                </div>
              </div>
            </div>

            {/* Keywords */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              <KeywordBlock
                title="Matched"
                icon={<CheckCircle2 size={15} color="#3fae6a" />}
                items={result.matched_keywords}
                tint="#1c2a20"
                border="#2c4633"
                text="#8fd3a5"
              />
              <KeywordBlock
                title="Missing from your resume"
                icon={<AlertCircle size={15} color="#e08a75" />}
                items={result.missing_keywords}
                tint="#2a1c1a"
                border="#4a2c26"
                text="#e6a893"
              />
            </div>

            {/* Weak bullets */}
            {result.weak_bullets && result.weak_bullets.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <SectionLabel icon={<TrendingUp size={15} />} text="Bullet rewrites" />
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                  {result.weak_bullets.map((b, i) => (
                    <div key={i} style={{ border: "1px solid #262b36", borderRadius: 10, padding: 18, background: "#171b24" }}>
                      <div style={{ fontSize: 13.5, color: "#8b91a0", marginBottom: 8, textDecoration: "line-through", textDecorationColor: "#4a3226" }}>
                        {b.original}
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <ChevronRight size={16} color="#f0c869" style={{ marginTop: 2, flexShrink: 0 }} />
                        <div style={{ fontSize: 14.5, color: "#e9e6dd", lineHeight: 1.5 }}>{b.rewrite}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top actions */}
            <div>
              <SectionLabel icon={<Sparkles size={15} />} text="This week's priorities" />
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {result.top_actions.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div className="mono" style={{ color: "#f0c869", fontSize: 13, minWidth: 22 }}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: 14.5, lineHeight: 1.55 }}>{a}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
      )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 6,
        border: "none",
        background: active ? "#f0c869" : "transparent",
        color: active ? "#12151c" : "#8b91a0",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {icon} {label}
    </button>
  );
}

function HistoryView({ history, loading, onDelete }) {
  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>Loading history…</div>;
  }
  if (history.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0", color: "#6b7280" }}>
        <History size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
        <div style={{ fontSize: 14 }}>No runs saved yet. Analyses you run are tracked here automatically.</div>
      </div>
    );
  }

  const chartData = history.map((h, i) => ({
    name: `#${i + 1}`,
    score: h.match_score,
    role: h.role,
  }));
  const best = Math.max(...history.map((h) => h.match_score));
  const first = history[0].match_score;
  const latest = history[history.length - 1].match_score;
  const delta = latest - first;

  return (
    <div className="fade-in">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard label="TOTAL RUNS" value={history.length} />
        <StatCard label="BEST SCORE" value={best} color="#3fae6a" />
        <StatCard
          label="TREND"
          value={`${delta >= 0 ? "+" : ""}${delta}`}
          color={delta >= 0 ? "#3fae6a" : "#e08a75"}
        />
      </div>

      <div style={{ border: "1px solid #262b36", borderRadius: 12, background: "#171b24", padding: 20, marginBottom: 24 }}>
        <SectionLabel icon={<TrendingUp size={15} />} text="Score over time" />
        <div style={{ height: 220, marginTop: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#262b36" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={11} />
              <YAxis stroke="#6b7280" fontSize={11} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: "#12151c", border: "1px solid #262b36", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#e9e6dd" }}
              />
              <Line type="monotone" dataKey="score" stroke="#f0c869" strokeWidth={2.5} dot={{ fill: "#f0c869", r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <SectionLabel icon={<Save size={15} />} text="All runs" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {[...history].reverse().map((h) => (
          <div
            key={h.id}
            style={{
              border: "1px solid #262b36",
              borderRadius: 10,
              padding: "14px 16px",
              background: "#171b24",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              className="serif"
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: "#12151c",
                border: `1px solid ${h.match_score >= 75 ? "#2c4633" : h.match_score >= 50 ? "#4a3f26" : "#4a2c26"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                fontWeight: 700,
                color: h.match_score >= 75 ? "#3fae6a" : h.match_score >= 50 ? "#d4a13d" : "#c1543f",
                flexShrink: 0,
              }}
            >
              {h.match_score}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e9e6dd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {h.role}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                {new Date(h.timestamp).toLocaleString()} · {h.missing_count} gaps flagged
              </div>
            </div>
            <button
              onClick={() => onDelete(h.id)}
              style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: 6 }}
              aria-label="Delete run"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "#e9e6dd" }) {
  return (
    <div style={{ border: "1px solid #262b36", borderRadius: 12, background: "#171b24", padding: "18px 20px" }}>
      <div className="mono" style={{ fontSize: 10.5, color: "#8b91a0", letterSpacing: "0.05em" }}>{label}</div>
      <div className="serif" style={{ fontSize: 28, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Panel({ icon, label, value, onChange, placeholder, onSample, allowUpload, onUpload, uploading, uploadError, fileName }) {
  const inputRef = React.useRef(null);
  return (
    <div style={{ border: "1px solid #262b36", borderRadius: 12, background: "#171b24", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #262b36" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#c9cdd6", fontSize: 13, fontWeight: 600 }}>
          {icon} {label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {allowUpload && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => onUpload(e.target.files && e.target.files[0])}
                style={{ display: "none" }}
              />
              <button
                onClick={() => inputRef.current && inputRef.current.click()}
                className="mono"
                disabled={uploading}
                style={{
                  background: "none",
                  border: "1px solid #33394a",
                  borderRadius: 6,
                  color: uploading ? "#6b7280" : "#f0c869",
                  fontSize: 11,
                  cursor: uploading ? "wait" : "pointer",
                  letterSpacing: "0.03em",
                  padding: "4px 9px",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {uploading ? (
                  <>
                    <Loader2 size={12} className="spin" /> READING…
                  </>
                ) : (
                  <>
                    <Upload size={12} /> UPLOAD FILE
                  </>
                )}
              </button>
            </>
          )}
          <button
            onClick={onSample}
            className="mono"
            style={{ background: "none", border: "none", color: "#6b7280", fontSize: 11, cursor: "pointer", letterSpacing: "0.03em" }}
          >
            USE SAMPLE
          </button>
        </div>
      </div>
      {fileName && !uploading && (
        <div style={{ padding: "8px 16px 0", display: "flex", alignItems: "center", gap: 6, color: "#8fd3a5", fontSize: 11.5 }} className="mono">
          <CheckCircle2 size={12} /> Loaded from {fileName}
        </div>
      )}
      {uploadError && (
        <div style={{ padding: "8px 16px 0", color: "#e08a75", fontSize: 11.5 }} className="mono">
          {uploadError}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          height: 220,
          background: "transparent",
          border: "none",
          color: "#e9e6dd",
          padding: 16,
          fontSize: 13.5,
          lineHeight: 1.6,
          resize: "vertical",
        }}
      />
    </div>
  );
}

function ScoreDial({ score, color }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width={120} height={120} style={{ flexShrink: 0 }}>
      <circle cx={60} cy={60} r={r} fill="none" stroke="#262b36" strokeWidth={10} />
      <circle
        cx={60}
        cy={60}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 1s ease" }}
      />
      <text x={60} y={57} textAnchor="middle" fontSize={26} fontWeight={700} fill="#e9e6dd" fontFamily="Fraunces, serif">
        {score}
      </text>
      <text x={60} y={76} textAnchor="middle" fontSize={10} fill="#8b91a0" fontFamily="IBM Plex Mono, monospace" letterSpacing="0.05em">
        MATCH
      </text>
    </svg>
  );
}

function KeywordBlock({ title, icon, items, tint, border, text }) {
  return (
    <div style={{ border: "1px solid #262b36", borderRadius: 12, padding: 18, background: "#171b24" }}>
      <SectionLabel icon={icon} text={title} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {(items || []).length === 0 && <span style={{ fontSize: 13, color: "#6b7280" }}>None found</span>}
        {(items || []).map((k, i) => (
          <span
            key={i}
            className="chip"
            style={{
              background: tint,
              border: `1px solid ${border}`,
              color: text,
              fontSize: 12.5,
              padding: "5px 11px",
              borderRadius: 999,
            }}
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ icon, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#c9cdd6", fontSize: 13.5, fontWeight: 600 }}>
      {icon} {text}
    </div>
  );
}
