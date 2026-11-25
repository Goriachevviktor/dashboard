import { useEffect, useState } from 'react';
import { useConfirmDialog } from '../components/common/useConfirmDialog.jsx';
import { activeMeetingTopics, canDownloadDraft, catalogEntryForTopic, completedTopics, topicIds, topicReports } from './brspState.js';
import './BrspSection.css';

const formatDate = value => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const sortMeetings = items => [...items].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
const topicCount = count => `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'тема' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'темы' : 'тем'}`;
const localToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

export default function BrspSection({ api, onError }) {
  const [meetings, setMeetings] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [topicTab, setTopicTab] = useState('active');
  const [createTopicIds, setCreateTopicIds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [dirtyIds, setDirtyIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dateInput, setDateInput] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [confirm, confirmDialog] = useConfirmDialog();

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listBrspMeetings(), api.listBrspTopics()]).then(([items, topics]) => {
      if (cancelled) return;
      const sorted = sortMeetings(items);
      setMeetings(sorted);
      setCatalog(topics);
      setSelectedId(sorted[0]?.id ?? null);
      setSelectedTopicId(sorted[0]?.topics[0]?.id ?? null);
    }).catch(error => { if (!cancelled) onError(error); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, onError]);

  const meeting = meetings.find(item => item.id === selectedId);
  const visibleTopics = topicTab === 'completed' ? completedTopics(catalog) : activeMeetingTopics(meeting, catalog);
  const topic = visibleTopics.find(item => item.id === selectedTopicId) || visibleTopics[0];
  const reports = topic ? topicReports(meetings, topicIds(catalog, topic.id), topicTab === 'completed' ? null : meeting?.date) : [];
  const isDirty = dirtyIds.includes(selectedId);
  const busy = savingId !== null;

  function selectMeeting(item) {
    setSelectedId(item.id);
    if (topicTab === 'active') setSelectedTopicId(activeMeetingTopics(item, catalog)[0]?.id ?? null);
  }

  function changeMeeting(change) {
    setMeetings(items => items.map(item => item.id === selectedId ? { ...item, ...change } : item));
    setDirtyIds(ids => ids.includes(selectedId) ? ids : [...ids, selectedId]);
  }

  function changeTopic(change) {
    if (!topic) return;
    changeMeeting({ topics: meeting.topics.map(item => item.id === topic.id ? { ...item, ...change } : item) });
  }

  async function saveMeeting(nextStatus) {
    if (!meeting || busy) return;
    const payload = { date: meeting.date, note: meeting.note, topics: meeting.topics, status: nextStatus || meeting.status };
    if (!payload.topics.every(item => item.name.trim())) { onError(new Error('Укажите названия всех тем')); return; }
    if (new Set(payload.topics.map(item => item.name.trim().toLocaleLowerCase('ru'))).size !== payload.topics.length) { onError(new Error('Названия тем не должны повторяться')); return; }
    setSavingId(meeting.id);
    try {
      const saved = await api.patchBrspMeeting(meeting.id, payload);
      setMeetings(items => sortMeetings(items.map(item => item.id === saved.id ? saved : item)));
      setCatalog(await api.listBrspTopics());
      setDirtyIds(ids => ids.filter(id => id !== saved.id));
    } catch (error) { onError(error); }
    finally { setSavingId(null); }
  }

  async function createMeeting(event) {
    event.preventDefault();
    if (meetings.some(item => item.date === dateInput)) { onError(new Error('Встреча на эту дату уже существует')); return; }
    setSavingId(-1);
    try {
      const created = await api.createBrspMeeting({ date: dateInput, topic_ids: createTopicIds });
      setMeetings(items => sortMeetings([...items, created]));
      setSelectedId(created.id);
      setSelectedTopicId(created.topics[0]?.id ?? null);
      setDialog(null);
    } catch (error) { onError(error); }
    finally { setSavingId(null); }
  }

  function addTopic(event) {
    event.preventDefault();
    const name = topicInput.trim();
    if (!meeting || !name) return;
    if (meeting.topics.some(item => item.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) {
      onError(new Error('Тема с таким названием уже есть во встрече'));
      return;
    }
    const newTopic = { id: crypto.randomUUID(), name, text: '' };
    changeMeeting({ topics: [...meeting.topics, newTopic] });
    setTopicTab('active');
    setSelectedTopicId(newTopic.id);
    setDialog(null);
  }

  async function removeTopic() {
    if (!topic) return;
    const approved = await confirm({
      title: 'Убрать тему из встречи?',
      message: 'Доклад по этой теме исчезнет только из выбранной встречи. В предыдущих встречах он останется.',
      itemTitle: topic.name,
      confirmText: 'Убрать',
    });
    if (!approved) return;
    const remaining = meeting.topics.filter(item => item.id !== topic.id);
    changeMeeting({ topics: remaining });
    setSelectedTopicId(remaining[0]?.id ?? null);
  }

  async function changeTopicStatus() {
    if (!topic || busy) return;
    const nextStatus = topicTab === 'completed' ? 'active' : 'completed';
    const currentTopicId = topic.id;
    setSavingId(-2);
    try {
      if (isDirty) {
        const saved = await api.patchBrspMeeting(meeting.id, {
          date: meeting.date, note: meeting.note, topics: meeting.topics, status: meeting.status,
        });
        setMeetings(items => sortMeetings(items.map(item => item.id === saved.id ? saved : item)));
        setDirtyIds(ids => ids.filter(id => id !== saved.id));
      }
      const updated = await api.patchBrspTopic(currentTopicId, { status: nextStatus });
      setCatalog(await api.listBrspTopics());
      if (nextStatus === 'active') {
        const relatedIds = [updated.id, ...(updated.aliases || [])];
        const latest = meeting?.topics.some(item => relatedIds.includes(item.id)) ? meeting : meetings.find(item => item.topics.some(entry => relatedIds.includes(entry.id)));
        if (latest) {
          setSelectedId(latest.id);
          setSelectedTopicId(latest.topics.find(item => relatedIds.includes(item.id)).id);
        }
      } else {
        setSelectedTopicId(updated.id);
      }
      setTopicTab(nextStatus === 'completed' ? 'completed' : 'active');
    } catch (error) { onError(error); }
    finally { setSavingId(null); }
  }

  async function deleteMeeting() {
    if (!meeting) return;
    const approved = await confirm({
      title: 'Удалить встречу?',
      message: 'Все доклады этой встречи будут удалены без возможности восстановления.',
      itemTitle: formatDate(meeting.date),
      confirmText: 'Удалить',
    });
    if (!approved) return;
    setSavingId(meeting.id);
    try {
      await api.deleteBrspMeeting(meeting.id);
      const remaining = meetings.filter(item => item.id !== meeting.id);
      setMeetings(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setSelectedTopicId(remaining[0]?.topics[0]?.id ?? null);
      setDirtyIds(ids => ids.filter(id => id !== meeting.id));
    } catch (error) { onError(error); }
    finally { setSavingId(null); }
  }

  async function downloadDraftPdf() {
    if (!meeting || busy || !canDownloadDraft(meeting)) return;
    if (isDirty) { onError(new Error('Сначала сохраните изменения во встрече')); return; }
    setSavingId(-3);
    try {
      const blob = await api.downloadBrspDraftPdf(meeting.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sink-brsp-${meeting.date}-draft.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { onError(error); }
    finally { setSavingId(null); }
  }

  return <div className="brsp-section">
    {confirmDialog}
    <div className="brsp-toolbar">
      <div className="brsp-toolbar-title">История встреч <span>{meetings.length}</span></div>
      <button type="button" className="brsp-button brsp-primary" disabled={loading || busy} onClick={() => { if (dirtyIds.length) { onError(new Error('Сначала сохраните изменения во встречах')); return; } setDateInput(localToday()); setCreateTopicIds(catalog.filter(item => item.status === 'active').map(item => item.id)); setDialog('meeting'); }}>+ Создать встречу</button>
    </div>
    <div className="brsp-board">
      <section className="brsp-column" aria-label="Встречи">
        <div className="brsp-column-header"><strong>Встречи</strong><small>По фактическим датам</small></div>
        <div className="brsp-meeting-list">
          {loading && <p className="brsp-placeholder">Загрузка встреч...</p>}
          {!loading && !meetings.length && <p className="brsp-placeholder">Пока нет встреч. Создайте первую.</p>}
          {meetings.map(item => <button key={item.id} type="button" className={`brsp-list-item ${item.id === selectedId ? 'selected' : ''}`} onClick={() => selectMeeting(item)}>
            <strong>{formatDate(item.date)}{dirtyIds.includes(item.id) ? ' *' : ''}</strong>
            <small><span className={`brsp-status ${item.status}`}>{item.status === 'draft' ? 'Черновик' : 'Проведена'}</span> · {topicCount(item.topics.length)}</small>
          </button>)}
        </div>
      </section>
      <section className="brsp-column" aria-label="Темы встречи">
        <div className="brsp-column-header brsp-header-actions"><div><strong>Темы встречи</strong><small>{topicTab === 'completed' ? `${visibleTopics.length} завершено` : meeting ? topicCount(visibleTopics.length) : 'Выберите встречу'}</small></div><button type="button" className="brsp-icon-button" aria-label="Добавить тему" title="Добавить тему" disabled={!meeting || busy} onClick={() => { setTopicInput(''); setDialog('topic'); }}>+</button></div>
        <div className="brsp-topic-tabs" role="tablist" aria-label="Состояние тем">
          <button type="button" role="tab" aria-selected={topicTab === 'active'} className={topicTab === 'active' ? 'active' : ''} onClick={() => { setTopicTab('active'); setSelectedTopicId(null); }}>Активные</button>
          <button type="button" role="tab" aria-selected={topicTab === 'completed'} className={topicTab === 'completed' ? 'active' : ''} onClick={() => { setTopicTab('completed'); setSelectedTopicId(null); }}>Завершённые</button>
        </div>
        <div className="brsp-topic-list">
          {!visibleTopics.length && <p className="brsp-placeholder">{topicTab === 'completed' ? 'Завершённых тем пока нет.' : meeting ? 'Добавьте первую тему.' : 'Выберите встречу.'}</p>}
          {visibleTopics.map(item => {
            const latest = topicReports(meetings, topicIds(catalog, item.id), topicTab === 'completed' ? null : meeting?.date)[0];
            const preview = topicTab === 'active' && item.text ? item.text : latest ? `Последний доклад · ${formatDate(latest.date)}` : 'Доклад не подготовлен';
            return <button key={item.id} type="button" className={`brsp-list-item ${item.id === topic?.id ? 'selected' : ''}`} onClick={() => setSelectedTopicId(item.id)}><strong>{item.name || 'Без названия'}</strong><small className="brsp-preview">{preview}</small></button>;
          })}
        </div>
      </section>
      <section className="brsp-editor" aria-label="Доклад">
        <div className="brsp-editor-header"><div><small>{topicTab === 'completed' ? 'Завершённая тема' : meeting ? formatDate(meeting.date) : 'Доклад'}</small><h2>{topic?.name || 'Выберите или добавьте тему'}</h2></div><div className="brsp-header-links">{topicTab === 'active' && <button type="button" className="brsp-link danger" disabled={!topic || busy} onClick={removeTopic}>Убрать из встречи</button>}{topic && <button type="button" className="brsp-link" disabled={busy || !catalogEntryForTopic(catalog, topic.id)} onClick={changeTopicStatus}>{topicTab === 'completed' ? 'Вернуть в активные' : 'Завершить тему'}</button>}</div></div>
        <div className="brsp-editor-body">
          {meeting && topicTab === 'active' && <>
            <div className="brsp-meta-fields"><label>Дата встречи<input type="date" value={meeting.date} disabled={busy} onChange={event => changeMeeting({ date: event.target.value })} /></label><label>Состояние<span className={`brsp-status ${meeting.status}`}>{meeting.status === 'draft' ? 'Черновик' : 'Проведена'}</span></label></div>
            {topic && <><label className="brsp-field-label" htmlFor="brsp-topic-name">Название темы</label><input id="brsp-topic-name" className="brsp-text-input" maxLength={100} value={topic.name} disabled={busy} onChange={event => changeTopic({ name: event.target.value })} /><div className="brsp-field-label">Краткий доклад</div><div className="brsp-report-history"><div className="brsp-current-report"><label htmlFor="brsp-report-text">Доклад встречи · {formatDate(meeting.date)}</label><textarea id="brsp-report-text" className="brsp-report-text" maxLength={20000} value={topic.text} disabled={busy} onChange={event => changeTopic({ text: event.target.value })} placeholder="Тезисы для выступления по этой теме..." /></div>{reports.map(item => <div className="brsp-history-entry" key={item.date}><strong>{formatDate(item.date)}</strong><p>{item.text}</p></div>)}</div></>}
            <label className="brsp-field-label" htmlFor="brsp-meeting-note">Общий комментарий по встрече</label><textarea id="brsp-meeting-note" className="brsp-note-text" maxLength={20000} value={meeting.note} disabled={busy} onChange={event => changeMeeting({ note: event.target.value })} placeholder="Решения, договорённости и вопросы вне отдельных тем..." />
          </>}
          {topicTab === 'completed' && (topic ? <><div className="brsp-field-label">Краткий доклад</div><div className="brsp-report-history">{reports.length ? reports.map(item => <div className="brsp-history-entry" key={item.date}><strong>{formatDate(item.date)}</strong><p>{item.text}</p></div>) : <p className="brsp-placeholder">По этой теме пока нет докладов.</p>}</div></> : <p className="brsp-placeholder">Завершённых тем пока нет.</p>)}
          {!meeting && topicTab === 'active' && <p className="brsp-placeholder">Выберите встречу слева или создайте новую.</p>}
        </div>
        {meeting && topicTab === 'active' && <div className="brsp-editor-footer"><span className="brsp-save-state">{isDirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}</span><div className="brsp-footer-actions"><button type="button" className="brsp-link danger" disabled={busy} onClick={deleteMeeting}>Удалить встречу</button>{meeting.status === 'draft' && <button type="button" className="brsp-button" title={canDownloadDraft(meeting) ? 'Скачать черновик встречи в PDF' : 'Сначала подготовьте хотя бы один доклад'} disabled={busy || !canDownloadDraft(meeting)} onClick={downloadDraftPdf}>Скачать PDF</button>}<button type="button" className="brsp-button" disabled={busy} onClick={() => saveMeeting(meeting.status === 'draft' ? 'done' : 'draft')}>{meeting.status === 'draft' ? 'Завершить встречу' : 'Вернуть в черновик'}</button><button type="button" className="brsp-button brsp-primary" disabled={busy || !isDirty} onClick={() => saveMeeting()}>{busy ? 'Сохранение...' : 'Сохранить'}</button></div></div>}
      </section>
    </div>
    {dialog && <div className="brsp-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDialog(null); }}><form className="brsp-modal" onSubmit={dialog === 'meeting' ? createMeeting : addTopic}><h2>{dialog === 'meeting' ? 'Новая встреча' : 'Добавить тему'}</h2><p>{dialog === 'meeting' ? 'Выберите активные темы для встречи. Доклады прошлых встреч останутся в истории.' : 'Тема появится в выбранной встрече.'}</p><label htmlFor="brsp-modal-input">{dialog === 'meeting' ? 'Дата встречи' : 'Название темы'}</label><input id="brsp-modal-input" autoFocus required type={dialog === 'meeting' ? 'date' : 'text'} maxLength={dialog === 'meeting' ? undefined : 100} value={dialog === 'meeting' ? dateInput : topicInput} onChange={event => dialog === 'meeting' ? setDateInput(event.target.value) : setTopicInput(event.target.value)} />{dialog === 'meeting' && <div className="brsp-topic-picker"><strong>Темы встречи</strong>{catalog.filter(item => item.status === 'active').map(item => <label key={item.id}><input type="checkbox" checked={createTopicIds.includes(item.id)} onChange={event => setCreateTopicIds(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />{item.name}</label>)}{!catalog.some(item => item.status === 'active') && <small>Активных тем пока нет.</small>}</div>}<div className="brsp-modal-actions"><button type="button" className="brsp-button" onClick={() => setDialog(null)}>Отмена</button><button type="submit" className="brsp-button brsp-primary" disabled={busy}>{dialog === 'meeting' ? 'Создать' : 'Добавить'}</button></div></form></div>}
  </div>;
}
