import { assetBase } from './core/host.js';
import React, { useState, useRef, useEffect } from 'react';
import RecordSheet from './components/RecordSheet.jsx';
import Home from './components/Home.jsx';
import ReviewSettings from './components/ReviewSettings.jsx';
import ReviewDetail from './components/ReviewDetail.jsx';
import Feedback from './components/Feedback.jsx';
import Crop from './components/Crop.jsx';
import Editor from './components/Editor.jsx';
import LiveLesson from './components/LiveLesson.jsx';
import Reader from './components/Reader.jsx';
import Correction from './components/Correction.jsx';
import PhotoPicker from './components/PhotoPicker.jsx';
import { Scored } from './components/Result.jsx';
import { Icon, Modal, StageTrack } from './components/UI.jsx';
import { changeSubject, corrected, get, saveQuestion, saveAttempt, remove } from './core/book.ts';
import { useNotebook } from './core/useNotebook.js';
import { useJob } from './core/useJob.js';
import { generateLesson } from './core/learning.js';
import { questionEntry, newDraft, overlapsQuestion } from './core/draft.js';
import { missingInput, questionChoices } from './core/message.js';
import { readingSteps } from './core/solution.js';
const names = {
  crop: '圈出一道错题',
  edit: '核对题目',
  result: '题目解析',
  review: '错题详情',
  correct: '独立重做',
  compare: '对照这次作答',
  score: '订正记录',
};

function useBack({
  page,
  nav,
  home,
  modal,
  ask,
  job,
  notice,
  attempt,
  setLevel,
  d,
  beforePhoto,
  correctionParent,
  write,
  setPhoto,
  title,
}) {
  const backRef = useRef(),
    lastField = useRef(null);
  useEffect(() => {
    lastField.current = null;
    const remember = (event) => {
      if (event.target instanceof HTMLTextAreaElement) lastField.current = event.target;
    };
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, [page]);
  function discard(text, fn) {
    const input = lastField.current;
    const selection = input && [input.selectionStart, input.selectionEnd];
    function resume() {
      requestAnimationFrame(() => {
        if (input?.isConnected) {
          input.focus();
          input.setSelectionRange(...selection);
        }
      });
    }
    ask({ title: '放弃本次未保存的内容？', text, cancel: '继续编辑', yes: '放弃并返回', go: fn, resume });
  }
  function back() {
    if (modal) {
      modal.resume?.();
      ask(null);
      return;
    }
    if (job.busy) {
      if (['正在保存…', '正在移除…'].includes(job.busy)) return;
      job.cancel();
      notice('操作已取消，原稿已保留。');
      return;
    }
    const settings = document.querySelector('dialog.subject-sheet[open]');
    if (settings) { settings.close(); return; }
    if (page === 'result') {
      nav(d.img ? 'crop' : 'edit');
      return;
    }
    if (page === 'compare') {
      nav('correct');
      return;
    }
    if (page === 'correct') {
      const workspace = document.querySelector('dialog.ink-workspace[open]');
      if (workspace) { workspace.close(); return; }
      const leave = () => correctionParent.current === 'home' ? home() : nav('review');
      if (attempt.answer.trim() || attempt.ink?.strokes.length || attempt.ink?.transcript || attempt.paper) discard('之前的订正记录会保留。', leave);
      else leave();
      return;
    }
    if (page === 'score') {
      setLevel(0);
      nav('review');
      return;
    }
    if (page === 'edit' && d.img) {
      nav('crop');
      return;
    }
    if (page === 'crop' || (page === 'edit' && (d.q || d.child || d.teacher))) {
      const leave = () => {
        if (page === 'crop' && beforePhoto.current) {
          write(beforePhoto.current);
          setPhoto(null);
          nav('edit');
        } else home();
      };
      if (page === 'crop' && !d.img && !beforePhoto.current) leave();
      else discard('之前收好的题仍在错题本里。', leave);
      return;
    }
    home();
  }
  backRef.current = back;
  useEffect(() => {
    if (page === 'home') {
      if (history.state?.shiti) history.back();
      return;
    }
    if (!history.state?.shiti) history.pushState({ shiti: true }, '', '');
    function pop() {
      history.pushState({ shiti: true }, '', '');
      backRef.current();
    }
    window.addEventListener('popstate', pop);
    window.scrollTo(0, 0);
    title.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('popstate', pop);
  }, [page]);

  return back;
}
function useLessonActions({ job, entry, beforePhoto, d, setBox, write, nav, notice }) {
  function accept(r, img, manual = false) {
    setBox(r);
    if (d.img === img && (d.q || manual)) {
      if (manual || questionChoices(d.q).length || missingInput(d.q)) nav('edit');
      else if (d.lesson) nav('result');
      else generate(d);
      return;
    }
    const prior = d.img ? (overlapsQuestion(d.box, r) ? d : null) : beforePhoto.current;
    const editedStem = prior && prior.q !== prior.recognizedText ? prior.q : '';
    if (manual) {
      write({
        ...newDraft(), id: d.id, model: d.model, img, box: r, source: '照片圈题',
        q: editedStem || '', child: prior?.child || '', teacher: prior?.teacher || '',
      });
      nav('edit');
      notice('选区已保存在本机。请对照图片核对题干，补上必要的图中条件。');
      return;
    }
    const draft = { ...newDraft(), id: d.id, box: r, img, source: '照片圈题',
      q: editedStem, child: prior?.child || '', teacher: prior?.teacher || '' };
    write(draft);
    nav('result');
    job.run('正在解析选区…', (signal, progress, publish) => analyzeDraft(draft, signal, progress, publish), true);
  }
  async function analyzeDraft(draft, signal, progress, publish) {
    const result = await generateLesson(
      draft, questionEntry(entry, JSON.stringify([draft.id, draft.img, draft.q, draft.child, draft.model])), signal, progress, publish,
    );
    if (signal.aborted) return;
    const { question, select, childWork, teacher, ...lesson } = result;
    const q = draft.q || question;
    const next = { ...draft, q, recognizedText: draft.recognizedText || question,
      teacher: draft.teacher || teacher || '', detectedWork: childWork || draft.detectedWork };
    if (select) {
      write({ ...next, lesson: undefined });
      nav('edit');
      notice('选区里有多道题，请选择要收录的一道。');
      return;
    }
    write({ ...next, lesson });
  }
  function generate(draft = d) {
    nav('result');
    // Keep the last completed lesson available if switching models fails or is cancelled.
    if (!draft.lesson) write(draft);
    job.run('正在连接模型…', (signal, progress, publish) =>
      analyzeDraft(draft, signal, progress, publish), true);
  }

  return { accept, generate };
}
function CapturePages({
  page,
  setBox,
  nav,
  photo,
  box,
  marks,
  accept,
  notice,
  error,
  d,
  write,
  generate,
  pick,
  editField,
  receipt,
}) {
  return (
    <>
      {page === 'crop' && (
        <Crop receipt={receipt} photo={photo} box={box} setBox={setBox} marks={marks} accept={accept} notice={notice} error={error} />
      )}
      {page === 'edit' && (
        <Editor
          d={d}
          focusField={editField}
          update={(v) => {
            write(prev => Object.entries(v).every(([key, value]) => prev[key] === value)
              ? prev : { ...prev, ...v, lesson: undefined });
            notice('');
          }}
          generate={generate}
          error={error}
          notice={notice}
          reframe={() => nav('crop')}
          selectPhoto={pick}
        />
      )}
    </>
  );
}
function ReviewPages({
  page,
  ask,
  generate,
  d,
  level,
  setLevel,
  begin,
  save,
  nav,
  error,
  home,
  attempt,
  setAttempt,
  finish,
  next,
  review,
  editField,
}) {
  return (
    <>
      {page === 'review' && (
        <ReviewDetail d={d} level={level} setLevel={setLevel} correct={begin} error={error} />
      )}
      {page === 'result' && (
        <Reader
          ask={ask}
          d={d}
          save={save}
          generate={generate}
          edit={(field) => {
            editField.current = field;
            nav('edit');
          }}
          error={error}
        />
      )}
      {['correct', 'compare'].includes(page) && (
        <Correction
          key={attempt.id}
          d={d}
          draft={attempt}
          setDraft={setAttempt}
          check={(onPaper) => {
            setAttempt({ ...attempt, paper: onPaper });
            nav('compare');
          }}
          compare={page === 'compare'}
          finish={finish}
          error={error}
        />
      )}
      {page === 'score' && (
        <Scored
          row={d}
          next={next ? () => review(next, 'correct') : null}
          review={(hint) => {
            setLevel(hint ? 1 : 0);
            nav('review');
          }}
          home={home}
        />
      )}
    </>
  );
}
function recordActions({ job, d, afterSave, nav, write, setLevel, setAttempt, attempt, correctionParent }) {
  function save(continuePhoto = false) {
    job.run('正在保存…', async () => {
      const row = {
        id: d.id,
        q: d.q,
        child: d.child,
        teacher: d.teacher,
        img: d.img,
        source: d.source,
        subject: d.lesson.subject,
        date: Date.now(),
        lesson: d.lesson,
        attempts: [],
      };
      await saveQuestion(row);
      afterSave(continuePhoto);
    });
  }
  function review(row, to = 'review') {
    job.run('正在读取…', async (signal) => {
      const item = await get(row.id);
      if (signal.aborted) return;
      if (item.lesson.provider === 'doubao') item.lesson.steps = readingSteps(item.lesson.steps);
      write(item);
      setLevel(0);
      if (to === 'correct') startAttempt('home');
      else nav(to);
    });
  }
  function startAttempt(parent) {
    correctionParent.current = parent;
    setAttempt({ id: crypto.randomUUID(), answer: '', paper: false });
    nav('correct');
  }
  function finish(correct) {
    job.run('正在保存…', async () => {
      const progress = await saveAttempt(d.id, { ...attempt, correct, date: Date.now() });
      write(current => ({ ...current, ...progress }));
      nav('score');
    });
  }
  return { save, review, begin: () => startAttempt('review'), finish };
}
function useFlow() {
  const book = useNotebook(),
    [page, go] = useState('home'),
    [d, write] = useState(newDraft),
    [photo, setPhoto] = useState(null),
    [box, setBox] = useState(null),
    [marks, mark] = useState([]);
  const [error, notice] = useState(''),
    [level, setLevel] = useState(0),
    [receipt, setReceipt] = useState(''),
    [modal, ask] = useState(null),
    [filter, selectFilter] = useState('全部'),
    [subject, selectSubject] = useState('all'),
    [attempt, setAttempt] = useState(null);
  const correctionParent = useRef('review'), beforePhoto = useRef(null),
    title = useRef(),
    editField = useRef(null),
    entry = useRef(null),
    job = useJob(notice);
  function nav(p) {
    setReceipt('');
    notice('');
    go(p);
  }
  function home(f) {
    job.cancel();
    nav('home');
    if (typeof f === 'string') selectFilter(f);
    write(newDraft());
    setPhoto(null);
    setBox(null);
    mark([]);
    beforePhoto.current = null;
    entry.current = null;
  }
  function edit() {
    write(newDraft());
    nav('edit');
  }
  const camera = useRef(null), album = useRef(null);
  function pick(fromCamera = false) {
    (fromCamera === true ? camera : album).current.click();
  }
  function selectFile(file) {
    beforePhoto.current = page === 'edit' ? d : null;
    setPhoto({ src: URL.createObjectURL(file) });
    setBox(null);
    mark([]);
    nav('crop');
  }
  const back = useBack({
    page,
    nav,
    home,
    modal,
    ask,
    job,
    notice,
    attempt,
    setLevel,
    d,
    beforePhoto,
    correctionParent,
    write,
    setPhoto,
    title,
  });
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.src);
    },
    [photo],
  );
  const { accept, generate } = useLessonActions({
    job,
    entry,
    beforePhoto,
    d,
    setBox,
    write,
    nav,
    notice,
  });
  function afterSave(continuePhoto) {
    if (continuePhoto && photo && d.box) {
      mark((old) => [...old, d.box]);
      write(newDraft());
      beforePhoto.current = null;
      entry.current = null;
      setBox(null);
      nav('crop');
      setReceipt('已收录 ' + (marks.length + 1) + ' 道');
    } else {
      selectSubject('all');
      home('全部');
      setReceipt('已加入错题本 · 待订正');
    }
  }
  function setQuestionSubject(subject) {
    job.run('正在保存…', async () => {
      await changeSubject(d.id, subject);
      write(current => ({ ...current, subject }));
    });
  }
  function requestRemoval() {
    ask({
      title: '移除这道题？',
      text: '本题的原作答和订正记录也将移除。',
      cancel: '保留',
      yes: '确认移除',
      go: () => job.run('正在移除…', async () => {
        await remove(d.id);
        home();
      }),
    });
  }
  const { save, review, begin, finish } = recordActions({ job, d, afterSave, nav, write, setLevel, setAttempt, attempt, correctionParent });
  const next = book.rows.find((r) => r.id !== d.id && !corrected(r) && (subject === 'all' || (r.subject || 'unknown') === subject));
  return {
    page, nav, home, back, title, modal, ask,
    book, filter, selectFilter, subject, selectSubject, receipt, next, review, setQuestionSubject, requestRemoval,
    camera, album, selectFile, photo, box, setBox, marks, pick, accept,
    d, write, edit, editField, generate, level, setLevel, save,
    attempt, setAttempt, begin, finish, job, error, notice,
  };
}
export default function App() {
  const flow = useFlow();
  const { page, book, filter, selectFilter, review, pick, edit, error, back, title, job, modal, ask } = flow;
  const checking = page === 'edit' && !job.preview;
  const pageTitle = checking ? (flow.d.img ? '修改题目' : '粘贴题目') : names[job.preview ? 'result' : page];
  const correctionStep = ['correct', 'compare', 'score'].indexOf(page);
  const compactHeader = page === 'review' || correctionStep >= 0;
  return (
    <>
      <header hidden={compactHeader} className={page === 'home' || page === 'add' ? 'bar library-brand' : 'bar'}>
        <div className="bar-inner">
          <span className="brand-wrap">
            <span className="brand"><img src={assetBase + 'brand/comma-idle.webp'} width="30" height="30" alt="" />小逗号</span>
            <span className="stamp">家庭错题本</span>
          </span>
        </div>
      </header>
      <PhotoPicker camera={flow.camera} album={flow.album} select={flow.selectFile} />
      <main className={page === 'home' || page === 'add' ? 'library-page' : undefined}>
        {page === 'home' && flow.receipt && <div className="collection-feedback" role="status"><Feedback kind="collected" />{flow.receipt}</div>}
        {page === 'add' && <RecordSheet close={back} photo={pick} text={edit} />}
        {page === 'home' || page === 'add' ? (
          <Home
            active={page === 'home'}
            rows={book.rows}
            loading={book.loading}
            filter={filter}
            selectFilter={selectFilter}
            open={review}
            subject={flow.subject}
            selectSubject={flow.selectSubject}
            record={() => flow.nav('add')}
            error={book.error || error}
          />
        ) : (
          <section
            className={
              'work work-' +
              page +
              (['edit', 'result', 'review', 'correct', 'compare'].includes(page) ? ' spread-work' : '')
            }
          >
            <header className={compactHeader ? 'detail-heading' : checking ? 'review-heading' : 'work-index'}>
              <button type="button" className="page-back" aria-label="返回" title="返回" onClick={back}>
                <Icon name="back" />
              </button>
              <h1 tabIndex="-1" ref={title}>{pageTitle}</h1>
              {page === 'review' && <ReviewSettings subject={flow.d.subject} busy={Boolean(job.busy)}
                setSubject={flow.setQuestionSubject} remove={flow.requestRemoval} />}
              {correctionStep >= 0 && <small className="correction-progress" aria-label={`第 ${correctionStep + 1} 步，共 3 步`}>{correctionStep + 1} / 3</small>}
              {!compactHeader && !checking && <StageTrack page={job.preview ? 'result' : page} />}
            </header>
            <LiveLesson job={job} lesson={flow.d.lesson} />
            <fieldset className="page-fields" hidden={Boolean(job.preview)} disabled={Boolean(job.busy)}>
              <CapturePages {...flow} />
              <ReviewPages {...flow} />
            </fieldset>
            {job.busy && !job.preview && (
              <p className="job-state" role="status">
                {job.busy}
              </p>
            )}
          </section>
        )}
      </main>
      {modal && <Modal info={modal} close={() => ask(null)} />}
    </>
  );
}
