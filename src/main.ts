import { MouthView } from './MouthView';
import { ZONES_12, ZONES_8, CHEWING_ZONES } from './protocol/zones';

function init() {
  const container = document.getElementById('app');
  if (!container) return;

  const mouthView = new MouthView(container);

  const controlsDiv = document.getElementById('controls');
  if (controlsDiv) {
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.onclick = () => {
      mouthView.clearHighlight();
      mouthView.resetCamera();
    };
    controlsDiv.appendChild(resetBtn);

    const zones = [...ZONES_12, ...ZONES_8, ...CHEWING_ZONES];
    zones.forEach(zone => {
      const btn = document.createElement('button');
      btn.textContent = zone.id;
      btn.onclick = () => {
        mouthView.highlightZone(zone.id);
        mouthView.focusZone(zone.id);
      };
      controlsDiv.appendChild(btn);
    });
  }
  
  // Make these accessible for Playwright to trigger
  (window as any).mouthView = mouthView;
  (window as any).ZONES = {}; // mock for tests to count teeth, wait, test-spike actually just checks keys.
  [...ZONES_12, ...ZONES_8, ...CHEWING_ZONES].forEach(z => {
      (window as any).ZONES[z.id] = true;
  });
}

init();
