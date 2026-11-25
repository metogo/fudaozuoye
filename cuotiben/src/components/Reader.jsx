import React from 'react';
import LearningText from './LearningText.jsx';
import { OriginalPhoto } from './QuestionSheet.jsx';
import ModelPicker from './ModelPicker.jsx';
import Guidance from './Guidance.jsx';

export default function Reader({ d, save, edit, generate, ask, error }) {
  const editQuestion = <button className="link reader-edit" onClick={() => edit('question')}>修改题目</button>;
  return (
    <div className="study-task result-reader">
      {d.lesson && <Guidance d={d} />}
      {error && <p className="alert" role="alert">{error}</p>}
      {!d.lesson && <button className="secondary" onClick={() => generate()}>重新解析</button>}
      {d.img ? <OriginalPhoto image={d.img}>{editQuestion}</OriginalPhoto> : editQuestion}
      {d.child && (
        <section className="paper child-note">
          <span className="eyebrow">孩子写到这里</span>
          <p className="preserve"><LearningText text={d.child} /></p>
        </section>
      )}
      <button className="link supplement-work" onClick={() => edit('child')}>补充孩子的原作答</button>
      <ModelPicker selected={d.model} hasChild={Boolean(d.child?.trim())} ask={ask}
        change={model => generate({ ...d, model })} />
      {d.lesson && (
        <div className="save-dock">
          <p className="save-note">收录后保存在当前浏览器</p>
          <div className="footer-act">
            {d.box && <button className="secondary" onClick={() => save(true)}>收录并圈下一题</button>}
            <button className="primary" onClick={() => save(false)}>加入错题本</button>
          </div>
        </div>
      )}
    </div>
  );
}
