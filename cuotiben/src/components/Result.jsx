import React from 'react';
import { Companion } from './UI.jsx';
import Feedback from './Feedback.jsx';
export function Scored({ row, next, review, home }) {
  const attempts = row.attempts,
    ok = attempts.at(-1).correct;
  return (
    <article className={'paper success score-slip ' + (ok ? 'resolved' : 'revisit')}>
      <div className="receipt-head">
        <div className={ok ? 'response-pair is-corrected' : 'response-pair'}>
          <Companion pose={ok ? 'ready' : 'idle'} />
          <Feedback kind={ok ? 'corrected' : 'again'} />
        </div>
        <h2>{ok ? '已订正' : '已保留在待订正'}</h2>
      </div>
      <div className="receipt-body">
        <p className="prose">
          {ok
            ? attempts.at(-2)?.correct === false
              ? '上次留下的这道题，这次你自己检查做对了。'
              : '这次重做已记下，下次可以从“已订正”找到它。'
            : '这次作答已记下，下次还能接着练。'}
        </p>
        <p className="softline">
          本题订正 {attempts.length} 次，自评做对 {attempts.filter((a) => a.correct).length} 次。
        </p>
      </div>
      <div className="footer-act">
        <button className="secondary" onClick={() => review(!ok)}>
          {ok ? '回到本题' : '回本题看提示'}
        </button>
        {next && (
          <button className="primary" onClick={next}>
            再做一道待订正
          </button>
        )}
        <button className={next ? 'link' : 'primary'} onClick={() => home(ok ? '已订正' : '待订正')}>
          查看{ok ? '已订正' : '待订正'}题目
        </button>
      </div>
    </article>
  );
}
