export interface Attempt {
  id: string;
  answer: string;
  paper: boolean;
  ink?: { strokes: [number, number][][]; autoTypeset?: boolean; proposedText?: string; transcript: string; transcriptNeedsReview?: boolean };
  correct: boolean;
  date: number;
}
export interface Lesson {
  hint: string;
  steps: string[];
  check: string;
  provider: string;
  modelId: string;
}
export interface Question {
  id: string;
  date: number;
  q: string;
  child: string;
  teacher: string;
  subject?: string;
  source: string;
  img: string;
  attempts: Attempt[];
  lesson: Lesson;
}
type StoredQuestion = Omit<Question, 'img'> & { img: Blob | string };
type Summary = Pick<Question, 'id' | 'date' | 'q' | 'source' | 'subject'> & { isCorrected: boolean; mistakeCount: number };
export function countMistakes(attempts: Attempt[] = []): number {
  return 1 + attempts.filter(attempt => attempt.correct === false).length;
}
export function corrected(row: { attempts?: Attempt[]; isCorrected?: boolean }): boolean {
  return row.isCorrected ?? row.attempts?.at(-1)?.correct === true;
}
let opening: Promise<IDBDatabase> | undefined;
function database() {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('shiti-family-live', 2);
      request.onupgradeneeded = () => {
        for (const name of ['questions', 'list', 'reviews']) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          opening = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      opening = undefined;
      throw error;
    });
  }
  return opening;
}
function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function list(): Promise<Summary[]> {
  const db = await database();
  const tx = db.transaction(['list', 'questions'], 'readwrite');
  const index = tx.objectStore('list');
  const summaries = await read<Summary[]>(index.getAll());
  // Backfill legacy list entries once, using the history in the same transaction.
  const rows = await Promise.all(summaries.map(async row => {
    if (typeof row.mistakeCount === 'number') return row;
    const question = await read<StoredQuestion>(tx.objectStore('questions').get(row.id));
    const summary = { ...row, mistakeCount: countMistakes(question.attempts) };
    await read(index.put(summary));
    return summary;
  }));
  return rows.sort((a, b) => b.date - a.date);
}
interface ReviewHistory { id: string; attempts: Attempt[] }
export async function get(id: string): Promise<StoredQuestion> {
  const db = await database();
  const tx = db.transaction(['questions', 'list', 'reviews']);
  const [question, summary, history] = await Promise.all([
    read<StoredQuestion | undefined>(tx.objectStore('questions').get(id)),
    read<Summary | undefined>(tx.objectStore('list').get(id)),
    read<ReviewHistory | undefined>(tx.objectStore('reviews').get(id)),
  ]);
  if (!question || !summary) throw Error('这道题已移除，请返回错题本。');
  return { ...question, subject: summary.subject, attempts: history?.attempts ?? question.attempts ?? [] };
}

async function update<T>(stores: string[], action: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await database();
  const tx = db.transaction(stores, 'readwrite');
  const committed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || Error('本地写入中断，请重试。'));
  });
  const work = action(tx).catch(error => {
    // A failed request may already have aborted the transaction.
    try {
      tx.abort();
    } catch (abortError) {
      if (!(abortError instanceof DOMException && abortError.name === 'InvalidStateError')) throw abortError;
    }
    throw error;
  });
  try {
    const [result] = await Promise.all([work, committed]);
    window.dispatchEvent(new Event('bookchange'));
    bus?.postMessage('refresh');
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError')
      throw Error('浏览器存储空间不足。请先释放设备空间，再回来重试，之前收好的题仍在。');
    throw error;
  }
}
const bus = typeof window === 'undefined' || !window.BroadcastChannel ? null : new BroadcastChannel('shiti-book');
if (bus) bus.onmessage = () => window.dispatchEvent(new Event('bookchange'));
export function saveQuestion(q: Question) {
  if (
    !q.lesson?.modelId ||
    !['doubao', 'requesty'].includes(q.lesson.provider) ||
    !q.lesson.hint?.trim() ||
    !q.lesson.steps?.length ||
    !q.lesson.check?.trim()
  )
    throw Error('请先取得真实模型的完整解析。');
  return storeQuestion(q);
}
async function storeQuestion(q: Question) {
  // Keep existing string records readable. New photos occupy one binary object.
  let photo: Blob | string = q.img;
  if (photo) {
    if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(photo)) throw Error('本题选区格式无效，请重新圈题。');
    photo = await (await fetch(photo)).blob();
  }
  await update(['questions', 'list'], async tx => {
    const questions = tx.objectStore('questions');
    if (await read(questions.getKey(q.id)) !== undefined) return;
    await Promise.all([
      read(questions.add({ ...q, img: photo })),
      read(tx.objectStore('list').add({
        id: q.id, date: q.date, q: Array.from(q.q).slice(0, 180).join(''),
        source: q.source, subject: q.subject,
        isCorrected: corrected(q), mistakeCount: countMistakes(q.attempts),
      })),
    ]);
  });
}
async function requireSummary(tx: IDBTransaction, id: string): Promise<Summary> {
  const row = await read<Summary | undefined>(tx.objectStore('list').get(id));
  if (!row) throw Error('这道题已移除，请返回错题本。');
  return row;
}
export function saveAttempt(id: string, attempt: Attempt) {
  return update(['questions', 'reviews', 'list'], async tx => {
    const reviews = tx.objectStore('reviews');
    const [summary, history] = await Promise.all([
      requireSummary(tx, id), read<ReviewHistory | undefined>(reviews.get(id)),
    ]);
    // The first review inherits any attempts saved by the old app. Keep its
    // original photo record intact, including when the image bytes are unavailable.
    const attempts = history?.attempts ?? (await read<StoredQuestion>(tx.objectStore('questions').get(id))).attempts ?? [];
    if (attempts.some(a => a.id === attempt.id)) return { attempts, subject: summary.subject };
    const next = [...attempts, attempt];
    await Promise.all([
      read(reviews.put({ id, attempts: next })),
      read(tx.objectStore('list').put({ ...summary, isCorrected: attempt.correct, mistakeCount: countMistakes(next) })),
    ]);
    return { attempts: next, subject: summary.subject };
  });
}
export function remove(id: string) {
  return update(['questions', 'reviews', 'list'], async tx => {
    await Promise.all(Array.from(tx.objectStoreNames, name => read(tx.objectStore(name).delete(id))));
  });
}
export function changeSubject(id: string, subject: string) {
  return update(['list'], async tx => {
    const row = await requireSummary(tx, id);
    await read(tx.objectStore('list').put({ ...row, subject }));
  });
}
