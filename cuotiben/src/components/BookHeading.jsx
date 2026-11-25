import React, { useRef, useCallback } from 'react';
import Feedback from './Feedback.jsx';
import { Companion } from './UI.jsx';
import { biteFrames, releaseFrames, celebrationStart, openingFrames } from '../core/opening.js';

const title = '错题本';
const glide = 'cubic-bezier(.34,0,.23,1)';

const end = openingFrames - 1;
function pose(frame, x, y, scale = 1, angle = 0, opacity = 1) {
  return { offset: frame / end, transform: `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${scale})`,
    opacity, easing: glide };
}

// Sample one continuous arc so the letter carries its speed through the apex.
function flight(start, duration, fromX, toX, height, scale = 1, tilt = 0) {
  return Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    const x = fromX + (toX - fromX) * t;
    const y = -4 * height * t * (1 - t);
    return { ...pose(start + duration * t, x, y, scale + (1 - scale) * t, tilt * (1 - t)), easing: 'linear' };
  });
}

function followBites(player, heading) {
  const mascot = heading.querySelector('.result-motion');
  const letters = [...heading.querySelectorAll('.book-letter')];
  const face = mascot.getBoundingClientRect();
  const boxes = letters.map(letter => letter.getBoundingClientRect());
  const leftLip = face.left + face.width * .18;
  const rightLip = face.right - face.width * .18;
  const stops = boxes.map(box => box.left + box.width * .64 - leftLip).reverse();
  const farSide = boxes.at(-1).right + 2 - leftLip;
  const travel = [pose(0,0,0), pose(6,-2,1), ...flight(7,24,-2,farSide,face.height * .58)];
  biteFrames.forEach((frame,i) => travel.push(pose(frame-5,stops[i]+4,-1.5), pose(frame,stops[i],0)));
  travel.push(pose(83,stops[2],0), ...flight(84,14,stops[2],0,5),
    pose(celebrationStart,0,0), pose(celebrationStart+12,0,1),
    ...flight(celebrationStart+13,28,0,0,face.height * .32),
    pose(celebrationStart+44,0,1.2), pose(celebrationStart+50,0,0), pose(end,0,0));

  function track(element, keys) {
    const motion = element.animate(keys, {duration:end, fill:'both'});
    motion.pause();
    return motion;
  }
  // Turn on the spot after returning home so the same mouth can blow the title back to the right.
  const turn = [[0,1],[99,1],[108,-1],[155,-1],[166,1],[end,1]].map(([frame, facing]) => ({
    offset: frame / end, transform: `scaleX(${facing})`, easing: glide,
  }));
  const tracks = [track(mascot, travel), track(mascot.querySelector(':scope > span'), turn)];
  letters.forEach((letter, i) => {
    const box = boxes[i];
    const bite = biteFrames[letters.length - 1 - i];
    const release = releaseFrames[i], duration = 13 + i * 2;
    const launch = rightLip - (box.left + box.width / 2);
    const landing = release + duration;
    tracks.push(track(letter, [
      pose(0,0,0), pose(bite-9,0,0), pose(bite-5,1,-1,.92,3),
      pose(bite,box.width*.14,0,.08,8,0), pose(release-1,launch,0,.1,-12,0),
      ...flight(release,duration,launch,0,box.height * (.36 + i * .26),.16,-14-i*3),
      pose(landing+2,0,1,.96,1.5), pose(landing+6,0,-.5,1.018,-.7), pose(celebrationStart-1,0,0), pose(end,0,0),
    ]));
  });
  player.addEventListener('enterFrame', ({currentTime}) => {
    for (const motion of tracks) motion.currentTime = currentTime;
  });
  player.addEventListener('destroy', () => tracks.forEach(motion => motion.cancel()));
}

export default function BookHeading({ active }) {
  const heading = useRef(null);
  const ready = useCallback(player => followBites(player, heading.current), []);
  return <div className="book-heading" ref={heading}>
    {active ? <Feedback kind="opening" onReady={ready} /> : <Companion />}
    <h1 id="book-title" aria-label={title}>
      {[...title].map(letter => <span key={letter} aria-hidden="true" className="book-letter">{letter}</span>)}
    </h1>
  </div>;
}
