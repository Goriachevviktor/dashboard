import React from 'react';
import { useState, useEffect } from 'react';
import StatCard from '../components/common/StatCard.jsx';
import { ConfirmDialog, useConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { useViewportFlags } from '../utils.js';

function AmbpSection({ initialTopics = [], api, onError }) {
  const { isMobile } = useViewportFlags();
  const [confirmDelete, confirmDialog] = useConfirmDialog();
  const [topics, setTopics] = useState(initialTopics || []);
  const [showCreate, setShowCreate] = useState(false);
  const [editTopic, setEditTopic] = useState(null);

  useEffect(() => {
    setTopics(initialTopics || []);
  }, [initialTopics]);

  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2edf8", fontSize: 14, color: "#1e3a6e", fontFamily: "Inter", outline: "none", background: "#f8fafc" };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block", letterSpacing: .3 };

  function money(value) {
    return `${Number(value || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} млн ₽`;
  }

  function percent(value) {
    return `${Number(value || 0).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  function completion(topic) {
    if (!Number(topic.planRevenue)) return 0;
    return Math.min(100, (Number(topic.factRevenue || 0) / Number(topic.planRevenue)) * 100);
  }

  function topicTone(topic) {
    const done = completion(topic);
    if (done >= 80) return { color: "#10b981", bg: "#10b98118", label: "Высокое исполнение" };
    if (done >= 35) return { color: "#2563eb", bg: "#2563eb18", label: "В работе" };
    if (done > 0) return { color: "#f59e0b", bg: "#f59e0b18", label: "Нужно ускорить" };
    return { color: "#94a3b8", bg: "#e2edf8", label: "Без факта" };
  }

  function AmbpTopicModal({ topic, onClose, onSubmit }) {
    const isEdit = Boolean(topic);
    const [title, setTitle] = useState(topic?.title || "");
    const [description, setDescription] = useState(topic?.description || "");
    const [planRevenue, setPlanRevenue] = useState(topic?.planRevenue ?? "");
    const [factRevenue, setFactRevenue] = useState(topic?.factRevenue ?? "");
    const [funnelLeads, setFunnelLeads] = useState(topic?.funnelLeads ?? "");
    const [funnelQualified, setFunnelQualified] = useState(topic?.funnelQualified ?? "");
    const [funnelProposals, setFunnelProposals] = useState(topic?.funnelProposals ?? "");
    const [funnelContracts, setFunnelContracts] = useState(topic?.funnelContracts ?? "");
    const [comment, setComment] = useState(topic?.comment || "");
    const [error, setError] = useState("");

    useEffect(() => {
      function onKeyDown(e) { if (e.key === "Escape") onClose(); }
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    function numeric(value) {
      return Number(String(value || "0").replace(",", ".")) || 0;
    }

    function handleSubmit() {
      if (!title.trim()) {
        setError("Введите название темы");
        return;
      }
      onSubmit({
        ...(topic ? { id: topic.id } : {}),
        title: title.trim(),
        description: description.trim(),
        planRevenue: numeric(planRevenue),
        factRevenue: numeric(factRevenue),
        funnelLeads: Math.round(numeric(funnelLeads)),
        funnelQualified: Math.round(numeric(funnelQualified)),
        funnelProposals: Math.round(numeric(funnelProposals)),
        funnelContracts: Math.round(numeric(funnelContracts)),
        comment: comment.trim(),
      });
      onClose();
    }

    return (
      <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 310, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
        <div style={{ width: "min(94vw, 820px)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 20, boxShadow: "0 24px 64px rgba(37,99,235,.22)" }}>
          <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #e8f1fd", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e" }}>{isEdit ? "Редактирование темы АМБП" : "Новая тема АМБП"}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>План, факт, воронка продаж и комментарий по активности</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#f0f6ff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={labelStyle}>Название темы *</label>
              <input value={title} onChange={e => { setTitle(e.target.value); setError(""); }} placeholder="Например: Импортозамещение ЕСФМ" style={{ ...inputStyle, borderColor: error ? "#ef4444" : "#e2edf8" }} />
              {error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>{error}</div>}
            </div>
            <div>
              <label style={labelStyle}>Описание темы</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Контекст, резерв, зона ответственности..." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>План выручки, млн ₽</label>
                <input value={planRevenue} onChange={e => setPlanRevenue(e.target.value)} inputMode="decimal" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Факт выручки, млн ₽</label>
                <input value={factRevenue} onChange={e => setFactRevenue(e.target.value)} inputMode="decimal" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14 }}>
              <div>
                <label style={labelStyle}>Лиды</label>
                <input value={funnelLeads} onChange={e => setFunnelLeads(e.target.value)} inputMode="numeric" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Квалификация</label>
                <input value={funnelQualified} onChange={e => setFunnelQualified(e.target.value)} inputMode="numeric" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Предложения</label>
                <input value={funnelProposals} onChange={e => setFunnelProposals(e.target.value)} inputMode="numeric" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Договоры</label>
                <input value={funnelContracts} onChange={e => setFunnelContracts(e.target.value)} inputMode="numeric" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Комментарий по активности</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} placeholder="Что сделано, что блокирует, какой следующий шаг..." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
          </div>
          <div style={{ padding: "16px 28px 24px", display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid #f0f6ff" }}>
            <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #e2edf8", background: "#f8fafc", color: "#64748b", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "Inter" }}>Отмена</button>
            <button onClick={handleSubmit} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 4px 12px rgba(37,99,235,.3)" }}>{isEdit ? "Сохранить изменения" : "Создать тему"}</button>
          </div>
        </div>
      </div>
    );
  }

  async function addTopic(topic) {
    try {
      const created = await api.createAmbpTopic(topic);
      setTopics(items => [...items, created]);
    } catch (error) {
      onError(error);
    }
  }

  async function saveTopic(topic) {
    try {
      const saved = await api.patchAmbpTopic(topic.id, topic);
      setTopics(items => items.map(item => item.id === saved.id ? saved : item));
    } catch (error) {
      onError(error);
    }
  }

  async function deleteTopic(topicId) {
    const topic = topics.find(item => item.id === topicId);
    const confirmed = await confirmDelete({
      title: "Удалить тему АМБП?",
      message: "Тема, план, факт и комментарий исчезнут из раздела. Это действие нельзя отменить.",
      itemTitle: topic?.title,
      confirmText: "Удалить",
    });
    if (!confirmed) return;
    try {
      await api.deleteAmbpTopic(topicId);
      setTopics(items => items.filter(item => item.id !== topicId));
      if (editTopic?.id === topicId) setEditTopic(null);
    } catch (error) {
      onError(error);
    }
  }

  const totalPlan = topics.reduce((sum, item) => sum + Number(item.planRevenue || 0), 0);
  const totalFact = topics.reduce((sum, item) => sum + Number(item.factRevenue || 0), 0);
  const totalLeft = Math.max(0, totalPlan - totalFact);
  const totalCompletion = totalPlan ? Math.min(100, totalFact / totalPlan * 100) : 0;
  const maxPlan = Math.max(1, ...topics.map(item => Number(item.planRevenue || 0)));
  const funnel = [
    { label: "Лиды", value: topics.reduce((sum, item) => sum + Number(item.funnelLeads || 0), 0), color: "#2563eb" },
    { label: "Квалификация", value: topics.reduce((sum, item) => sum + Number(item.funnelQualified || 0), 0), color: "#0ea5e9" },
    { label: "Предложения", value: topics.reduce((sum, item) => sum + Number(item.funnelProposals || 0), 0), color: "#10b981" },
    { label: "Договоры", value: topics.reduce((sum, item) => sum + Number(item.funnelContracts || 0), 0), color: "#f59e0b" },
  ];
  const maxFunnel = Math.max(1, ...funnel.map(item => item.value));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {confirmDialog}
      {showCreate && <AmbpTopicModal onClose={() => setShowCreate(false)} onSubmit={addTopic} />}
      {editTopic && <AmbpTopicModal topic={editTopic} onClose={() => setEditTopic(null)} onSubmit={(topic) => { saveTopic(topic); setEditTopic(null); }} />}

      <div style={{ background: "#fff", borderRadius: isMobile ? 18 : 20, padding: isMobile ? 14 : 28, boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 10px 28px rgba(37,99,235,.08)", border: "1px solid #dbeafe" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: isMobile ? 14 : 22 }}>
          <div>
            {!isMobile && <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.6, color: "#0ea5e9", textTransform: "uppercase", marginBottom: 8 }}>Воронка дополнительной выручки</div>}
            <div style={{ fontSize: isMobile ? 20 : 34, fontWeight: 850, color: "#1e3a6e", lineHeight: 1.15 }}>АМБП: бизнес-план активностей</div>
            {!isMobile && <div style={{ fontSize: 14, color: "#64748b", marginTop: 12, maxWidth: 780, lineHeight: 1.6 }}>Сводный dashboard по достижению показателей бизнес-плана: план, факт исполнения, резервы, воронка продаж и комментарии по подтвержденным активностям.</div>}
          </div>
          <button onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "9px 12px" : "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 4px 14px rgba(37,99,235,.28)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            Создать тему
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: isMobile ? 6 : 12, marginBottom: isMobile ? 14 : 20 }}>
          <StatCard compact={isMobile} label="План АМБП" value={money(totalPlan)} sub="общий план" color="#1e3a6e"/>
          <StatCard compact={isMobile} label="Факт исполнения" value={money(totalFact)} sub="подтверждено" color="#2563eb"/>
          <StatCard compact={isMobile} label="Исполнение" value={percent(totalCompletion)} sub="от плана" color="#10b981"/>
          <StatCard compact={isMobile} label="Остаток" value={money(totalLeft)} sub="до плана" color="#f59e0b"/>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a6e" }}>Прогресс исполнения бизнес-плана</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#2563eb" }}>{percent(totalCompletion)}</div>
        </div>
        <div style={{ height: 16, borderRadius: 999, background: "#e2edf8", overflow: "hidden" }}>
          <div style={{ width: `${totalCompletion}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#10b981,#6ee7b7)" }}></div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr .9fr", gap: 18 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: isMobile ? 14 : 22, boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)", border: "1px solid #e2edf8" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1e3a6e", marginBottom: 4 }}>Визуализация плана и факта</div>
          {!isMobile && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 18 }}>План показан широкой подложкой, факт — зелёным заполнением.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {topics.map(topic => {
              const done = completion(topic);
              return (
                <div key={topic.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "190px 1fr 100px", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a6e" }}>{topic.title}</div>
                  <div style={{ height: 24, borderRadius: 999, background: "#e2edf8", overflow: "hidden", position: "relative" }}>
                    <div style={{ width: `${Math.max(5, Number(topic.planRevenue || 0) / maxPlan * 100)}%`, height: "100%", borderRadius: 999, background: "#93c5fd", opacity: .52 }}></div>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${done}%`, borderRadius: 999, background: "linear-gradient(90deg,#10b981,#6ee7b7)" }}></div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#1e3a6e", textAlign: isMobile ? "left" : "right" }}>{money(topic.planRevenue)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: isMobile ? 14 : 22, boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)", border: "1px solid #e2edf8" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1e3a6e", marginBottom: 14 }}>Воронка продаж</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {funnel.map((stage, index) => (
              <div key={stage.label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1e3a6e" }}>{index + 1}. {stage.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: stage.color }}>{stage.value}</span>
                </div>
                <div style={{ height: 14, borderRadius: 999, background: "#e2edf8", overflow: "hidden" }}>
                  <div style={{ width: `${stage.value / maxFunnel * 100}%`, height: "100%", borderRadius: 999, background: stage.color }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: isMobile ? 14 : 22, boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)", border: "1px solid #e2edf8" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1e3a6e", marginBottom: 4 }}>Комментарии по активностям</div>
          {!isMobile && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>Каждая карточка содержит план, факт, исполнение и текущий комментарий.</div>}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {topics.map(topic => {
              const done = completion(topic);
              const tone = topicTone(topic);
              return (
                <div key={topic.id} style={{ padding: 14, background: "#f8fafc", borderRadius: 14, border: "1px solid #e2edf8", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#1e3a6e", lineHeight: 1.35 }}>{topic.title}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{topic.description || "Описание не указано"}</div>
                    </div>
                    <span style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 800, color: tone.color, background: tone.bg, padding: "4px 9px", borderRadius: 999 }}>{percent(done)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                    <div style={{ padding: 8, background: "#fff", borderRadius: 10, border: "1px solid #e8f1fd" }}><div style={{ fontSize: 10, color: "#64748b" }}>План</div><div style={{ fontSize: 12, fontWeight: 800, color: "#1e3a6e", marginTop: 4 }}>{money(topic.planRevenue)}</div></div>
                    <div style={{ padding: 8, background: "#fff", borderRadius: 10, border: "1px solid #e8f1fd" }}><div style={{ fontSize: 10, color: "#64748b" }}>Факт</div><div style={{ fontSize: 12, fontWeight: 800, color: "#1e3a6e", marginTop: 4 }}>{money(topic.factRevenue)}</div></div>
                    <div style={{ padding: 8, background: "#fff", borderRadius: 10, border: "1px solid #e8f1fd" }}><div style={{ fontSize: 10, color: "#64748b" }}>Остаток</div><div style={{ fontSize: 12, fontWeight: 800, color: "#1e3a6e", marginTop: 4 }}>{money(Math.max(0, topic.planRevenue - topic.factRevenue))}</div></div>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "#e2edf8", overflow: "hidden" }}><div style={{ width: `${done}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#10b981,#6ee7b7)" }}></div></div>
                  <div style={{ fontSize: 13, color: "#1e3a6e", lineHeight: 1.55 }}>{topic.comment || "Комментарий пока не добавлен."}</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setEditTopic(topic)} style={{ padding: "7px 11px", borderRadius: 8, border: "1px solid #dbeafe", background: "#fff", color: "#2563eb", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Inter" }}>Редактировать</button>
                    <button onClick={() => deleteTopic(topic.id)} style={{ padding: "7px 11px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#ef4444", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Inter" }}>Удалить</button>
                  </div>
                </div>
              );
            })}
          </div>
      </div>
    </div>
  );
}

export default AmbpSection;
