import { useEffect, useState } from 'react';
import { useConfirmDialog } from '../components/common/useConfirmDialog.jsx';
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
    api.listBrspMeetings().then(items => {
      if (cancelled) return;
      const sorted = sortMeetings(items);
      setMeetings(sorted);
      setSelectedId(sorted[0]?.id ?? null);
      setSelectedTopicId(sorted[0]?.topics[0]?.id ?? null);
    }).catch(error => { if (!cancelled) onError(error); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, onError]);

  const meeting = meetings.find(item => item.id === selectedId);
  const topic = meeting?.topics.find(item => item.id === selectedTopicId) || meeting?.topics[0];
  const isDirty = dirtyIds.includes(selectedId);
  const busy = savingId !== null;

  function selectMeeting(item) {
    setSelectedId(item.id);
    setSelectedTopicId(item.topics[0]?.id ?? null);
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
      setDirtyIds(ids => ids.filter(id => id !== saved.id));
    } catch (error) { onError(error); }
    finally { setSavingId(null); }
  }

  async function createMeeting(event) {
    event.preventDefault();
    if (meetings.some(item => item.date === dateInput)) { onError(new Error('Встреча на эту дату уже существует')); return; }
    setSavingId(-1);
    try {
      const created = await api.createBrspMeeting({ date: dateInput });
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

  return <div className="brsp-section">
    {confirmDialog}
    <div className="brsp-toolbar">
      <div className="brsp-toolbar-title">История встреч <span>{meetings.length}</span></div>
      <button type="button" className="brsp-button brsp-primary" onClick={() => { setDateInput(localToday()); setDialog('meeting'); }}>+ Создать встречу</button>
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
        <div className="brsp-column-header brsp-header-actions"><div><strong>Темы встречи</strong><small>{meeting ? topicCount(meeting.topics.length) : 'Выберите встречу'}</small></div><button type="button" className="brsp-icon-button" aria-label="Добавить тему" title="Добавить тему" disabled={!meeting || busy} onClick={() => { setTopicInput(''); setDialog('topic'); }}>+</button></div>
        <div className="brsp-topic-list">
          {meeting && !meeting.topics.length && <p className="brsp-placeholder">Добавьте первую тему.</p>}
          {meeting?.topics.map(item => <button key={item.id} type="button" className={`brsp-list-item ${item.id === topic?.id ? 'selected' : ''}`} onClick={() => setSelectedTopicId(item.id)}><strong>{item.name || 'Без названия'}</strong><small className="brsp-preview">{item.text || 'Доклад не подготовлен'}</small></button>)}
        </div>
      </section>
      <section className="brsp-editor" aria-label="Доклад">
        <div className="brsp-editor-header"><div><small>{meeting ? formatDate(meeting.date) : 'Доклад'}</small><h2>{topic?.name || 'Выберите или добавьте тему'}</h2></div><button type="button" className="brsp-link danger" disabled={!topic || busy} onClick={removeTopic}>Убрать из встречи</button></div>
        <div className="brsp-editor-body">
          {meeting && <>
            <div className="brsp-meta-fields"><label>Дата встречи<input type="date" value={meeting.date} disabled={busy} onChange={event => changeMeeting({ date: event.target.value })} /></label><label>Состояние<span className={`brsp-status ${meeting.status}`}>{meeting.status === 'draft' ? 'Черновик' : 'Проведена'}</span></label></div>
            {topic && <><label className="brsp-field-label" htmlFor="brsp-topic-name">Название темы</label><input id="brsp-topic-name" className="brsp-text-input" maxLength={100} value={topic.name} disabled={busy} onChange={event => changeTopic({ name: event.target.value })} /><label className="brsp-field-label" htmlFor="brsp-report-text">Краткий доклад</label><textarea id="brsp-report-text" className="brsp-report-text" maxLength={20000} value={topic.text} disabled={busy} onChange={event => changeTopic({ text: event.target.value })} placeholder="Тезисы для выступления по этой теме..." /></>}
            <label className="brsp-field-label" htmlFor="brsp-meeting-note">Общий комментарий по встрече</label><textarea id="brsp-meeting-note" className="brsp-note-text" maxLength={20000} value={meeting.note} disabled={busy} onChange={event => changeMeeting({ note: event.target.value })} placeholder="Решения, договорённости и вопросы вне отдельных тем..." />
          </>}
          {!meeting && <p className="brsp-placeholder">Выберите встречу слева или создайте новую.</p>}
        </div>
        {meeting && <div className="brsp-editor-footer"><span className="brsp-save-state">{isDirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}</span><div className="brsp-footer-actions"><button type="button" className="brsp-link danger" disabled={busy} onClick={deleteMeeting}>Удалить встречу</button><button type="button" className="brsp-button" disabled={busy} onClick={() => saveMeeting(meeting.status === 'draft' ? 'done' : 'draft')}>{meeting.status === 'draft' ? 'Завершить встречу' : 'Вернуть в черновик'}</button><button type="button" className="brsp-button brsp-primary" disabled={busy || !isDirty} onClick={() => saveMeeting()}>{busy ? 'Сохранение...' : 'Сохранить'}</button></div></div>}
      </section>
    </div>
    {dialog && <div className="brsp-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDialog(null); }}><form className="brsp-modal" onSubmit={dialog === 'meeting' ? createMeeting : addTopic}><h2>{dialog === 'meeting' ? 'Новая встреча' : 'Добавить тему'}</h2><p>{dialog === 'meeting' ? 'Темы предыдущей по дате встречи будут скопированы без старых докладов.' : 'Тема появится в выбранной встрече.'}</p><label htmlFor="brsp-modal-input">{dialog === 'meeting' ? 'Дата встречи' : 'Название темы'}</label><input id="brsp-modal-input" autoFocus required type={dialog === 'meeting' ? 'date' : 'text'} maxLength={dialog === 'meeting' ? undefined : 100} value={dialog === 'meeting' ? dateInput : topicInput} onChange={event => dialog === 'meeting' ? setDateInput(event.target.value) : setTopicInput(event.target.value)} /><div className="brsp-modal-actions"><button type="button" className="brsp-button" onClick={() => setDialog(null)}>Отмена</button><button type="submit" className="brsp-button brsp-primary" disabled={busy}>{dialog === 'meeting' ? 'Создать' : 'Добавить'}</button></div></form></div>}
  </div>;
}
