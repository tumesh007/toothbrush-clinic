import { MouthView } from './MouthView';
import { SessionStateMachine } from './protocol/StateMachine';
import { BrushingController } from './BrushingController';
import { LocalStorageSettingsStore, WebVoicePort, WebSoundPort, WebHapticPort, WebKeepAwakePort } from './adapters';
import { createAutoProtocol } from './protocol/allocation';
import { SessionData } from './protocol/StateMachine';
import { ZONES_12, ZONES_8, CHEWING_ZONES } from './protocol/zones';

class ClockAdapter {
  now() { return performance.now(); }
}

async function init() {
  const container = document.getElementById('app')!;
  
  // Ensure the app container fills the screen with real pixel dimensions
  container.style.position = 'relative';
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.overflow = 'hidden';

  const mouthViewContainer = document.createElement('div');
  mouthViewContainer.id = 'mouth-view-container';
  mouthViewContainer.style.width = '100%';
  mouthViewContainer.style.height = '100%';
  mouthViewContainer.style.position = 'absolute';
  mouthViewContainer.style.top = '0';
  mouthViewContainer.style.left = '0';
  mouthViewContainer.style.zIndex = '1';
  // touch-action on the CONTAINER too, belt-and-suspenders for Android
  mouthViewContainer.style.touchAction = 'none';
  container.appendChild(mouthViewContainer);

  // Small forced layout to ensure clientWidth/clientHeight are non-zero before Three.js reads them
  mouthViewContainer.getBoundingClientRect();

  const mouthView = new MouthView(mouthViewContainer);
  (window as any).mouthView = mouthView;
  (window as any).ZONES = {};
  [...ZONES_12, ...ZONES_8, ...CHEWING_ZONES].forEach(z => {
      (window as any).ZONES[z.id] = true;
  });

  const uiLayer = document.createElement('div');
  uiLayer.id = 'ui-layer';
  uiLayer.style.position = 'absolute';
  uiLayer.style.top = '0';
  uiLayer.style.left = '0';
  uiLayer.style.width = '100%';
  uiLayer.style.height = '100%';
  uiLayer.style.zIndex = '10';
  // MUST be none so touches pass through to the Three.js canvas below
  uiLayer.style.pointerEvents = 'none';
  container.appendChild(uiLayer);
  
  const store = new LocalStorageSettingsStore();
  let settings = await store.load();
  
  mouthView.setCameraMode(settings.cameraMode);
  mouthView.setReducedMotion(settings.reducedAnimation);
  
  const clock = new ClockAdapter();
  const sm = new SessionStateMachine(clock);
  const voice = new WebVoicePort();
  const sound = new WebSoundPort();
  const haptics = new WebHapticPort();
  const keepAwake = new WebKeepAwakePort();
  
  let controller: BrushingController | null = null;
  
  function renderUI(html: string) {
    uiLayer.innerHTML = html;
    // Enable pointer events on buttons inside uiLayer
    const elements = uiLayer.querySelectorAll('*');
    elements.forEach(el => {
      (el as HTMLElement).style.pointerEvents = 'auto';
    });
  }
  
  function zoneLabel(zoneId: string): string {
    const labels: Record<string, string> = {
      'upper_right_outer':   'Upper right — outside',
      'upper_front_outer':   'Upper front — outside',
      'upper_left_outer':    'Upper left — outside',
      'lower_right_outer':   'Lower right — outside',
      'lower_front_outer':   'Lower front — outside',
      'lower_left_outer':    'Lower left — outside',
      'upper_right_inner':   'Upper right — inside',
      'upper_front_inner':   'Upper front — inside',
      'upper_left_inner':    'Upper left — inside',
      'lower_right_inner':   'Lower right — inside',
      'lower_front_inner':   'Lower front — inside',
      'lower_left_inner':    'Lower left — inside',
      'upper_right_chewing': 'Upper right — chewing surface',
      'upper_left_chewing':  'Upper left — chewing surface',
      'lower_right_chewing': 'Lower right — chewing surface',
      'lower_left_chewing':  'Lower left — chewing surface',
      'q_upper_right_outer': 'Upper right — outside',
      'q_upper_left_outer':  'Upper left — outside',
      'q_lower_right_outer': 'Lower right — outside',
      'q_lower_left_outer':  'Lower left — outside',
      'q_upper_right_inner': 'Upper right — inside',
      'q_upper_left_inner':  'Upper left — inside',
      'q_lower_right_inner': 'Lower right — inside',
      'q_lower_left_inner':  'Lower left — inside',
    };
    return labels[zoneId] ?? zoneId.replace(/_/g, ' ');
  }

  function sectionCount(): number {
    return settings.chewing ? settings.zoneMode + 4 : settings.zoneMode;
  }

  function showHome() {
    mouthViewContainer.style.visibility = 'hidden';
    mouthView.resetCamera();
    mouthView.clearHighlight();

    const mins  = Math.floor(settings.duration / 60);
    const sects = sectionCount();

    renderUI(`
      <div style="background:white; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif; pointer-events:auto;">
        <h1 style="margin-bottom:4px;">&#129463; Toothbrush Clinic</h1>
        <p style="color:#555; margin:4px 0 20px;">${mins} min &middot; ${sects} sections${settings.chewing ? ' &middot; chewing surfaces' : ''}</p>
        <button id="btn-start" style="padding:16px 40px; font-size:22px; margin:8px; border-radius:10px; border:none; background:#007bff; color:white; width:80%;">Start Brushing</button>
        <button id="btn-settings" style="padding:14px 40px; font-size:18px; margin:8px; border-radius:10px; border:1px solid #ccc; background:white; width:80%;">&#9881; Settings</button>
      </div>
    `);

    document.getElementById('btn-start')!.onclick = startBrushing;
    document.getElementById('btn-settings')!.onclick = () => showParentGate(showSettings);
  }

  function showParentGate(onSuccess: () => void) {
    renderUI(`
      <div style="background: white; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif; pointer-events: auto;">
        <h2>Parent Gate</h2>
        <p>What is 2 + 3?</p>
        <div>
          <button class="ans" data-val="4" style="padding:15px; margin:5px;">4</button>
          <button class="ans" data-val="5" style="padding:15px; margin:5px;">5</button>
          <button class="ans" data-val="6" style="padding:15px; margin:5px;">6</button>
        </div>
        <button id="btn-cancel" style="margin-top: 20px;">Cancel</button>
      </div>
    `);

    document.querySelectorAll('.ans').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        if (btn.getAttribute('data-val') === '5') { onSuccess(); } else { showHome(); }
      };
    });
    document.getElementById('btn-cancel')!.onclick = showHome;
  }

  function showSettings() {
    renderUI(`
      <div style="background:white; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; padding:20px; box-sizing:border-box; font-family:sans-serif; overflow-y:auto; pointer-events:auto;">
        <h2>Settings</h2>
        <div style="width:90%; max-width:400px;">
          <p style="font-weight:bold; margin-bottom:6px;">Brushing time</p>
          ${[2,3,4,5,6].map((m: number) => `
            <label style="display:flex; align-items:center; padding:10px; margin:4px 0; border:2px solid ${settings.duration===m*60?'#007bff':'#ccc'}; border-radius:8px; cursor:pointer;">
              <input type="radio" name="duration" value="${m*60}" ${settings.duration===m*60?'checked':''} style="margin-right:10px;">
              ${m} minutes
            </label>`).join('')}
          <p style="font-weight:bold; margin:16px 0 6px;">Brushing sections</p>
          <label style="display:flex; align-items:center; padding:10px; margin:4px 0; border:2px solid ${settings.zoneMode===12?'#007bff':'#ccc'}; border-radius:8px; cursor:pointer;">
            <input type="radio" name="zones" value="12" ${settings.zoneMode===12?'checked':''} style="margin-right:10px;"> 12 sections
          </label>
          <label style="display:flex; align-items:center; padding:10px; margin:4px 0; border:2px solid ${settings.zoneMode===8?'#007bff':'#ccc'}; border-radius:8px; cursor:pointer;">
            <input type="radio" name="zones" value="8" ${settings.zoneMode===8?'checked':''} style="margin-right:10px;"> 8 sections
          </label>
          <p style="font-weight:bold; margin:16px 0 6px;">Mouth view</p>
          <label style="display:block; padding:8px 0;"><input type="radio" name="camera-mode" value="auto" ${settings.cameraMode==='auto'?'checked':''}> Follow brushing zones</label>
          <label style="display:block; padding:8px 0;"><input type="radio" name="camera-mode" value="manual" ${settings.cameraMode==='manual'?'checked':''}> Manual camera controls</label>
          <label style="display:block; padding:8px 0;"><input type="checkbox" id="chk-reduced-motion" ${settings.reducedAnimation?'checked':''}> Reduce camera motion</label>
          <p style="font-weight:bold; margin:16px 0 6px;">Chewing surfaces</p>
          <label style="display:flex; align-items:center; padding:12px; border:2px solid ${settings.chewing?'#007bff':'#ccc'}; border-radius:8px; cursor:pointer;">
            <input type="checkbox" id="chk-chewing" ${settings.chewing?'checked':''} style="margin-right:10px; width:18px; height:18px;">
            <span><strong>Brush chewing surfaces</strong><br><small style="color:#666;">Brush the top/chewing surfaces of your back teeth too.</small></span>
          </label>
          <p style="font-weight:bold; margin:16px 0 6px;">Sound &amp; feedback</p>
          <label style="display:block; padding:8px 0;"><input type="checkbox" id="chk-voice" ${settings.voice?'checked':''}> Voice instructions</label>
          <label style="display:block; padding:8px 0;"><input type="checkbox" id="chk-sound" ${settings.sound?'checked':''}> Sound effects</label>
          <label style="display:block; padding:8px 0;"><input type="checkbox" id="chk-haptics" ${settings.haptics?'checked':''}> Vibration</label>
          <button id="btn-save" style="width:100%; padding:16px; font-size:20px; margin-top:24px; border-radius:10px; border:none; background:#28a745; color:white;">Save &amp; Exit</button>
        </div>
      </div>
    `);

    document.getElementById('btn-save')!.onclick = async () => {
      const durationEl = document.querySelector('input[name="duration"]:checked') as HTMLInputElement;
      const zonesEl   = document.querySelector('input[name="zones"]:checked')    as HTMLInputElement;
      settings.duration  = durationEl ? parseInt(durationEl.value) : settings.duration;
      settings.zoneMode  = zonesEl    ? parseInt(zonesEl.value) as 8|12 : settings.zoneMode;
      const cameraEl = document.querySelector('input[name="camera-mode"]:checked') as HTMLInputElement;
      settings.cameraMode = cameraEl ? cameraEl.value as 'auto'|'manual' : settings.cameraMode;
      settings.reducedAnimation = (document.getElementById('chk-reduced-motion') as HTMLInputElement).checked;
      settings.chewing   = (document.getElementById('chk-chewing')  as HTMLInputElement).checked;
      settings.voice     = (document.getElementById('chk-voice')    as HTMLInputElement).checked;
      settings.sound     = (document.getElementById('chk-sound')    as HTMLInputElement).checked;
      settings.haptics   = (document.getElementById('chk-haptics')  as HTMLInputElement).checked;
      mouthView.setCameraMode(settings.cameraMode);
      mouthView.setReducedMotion(settings.reducedAnimation);
      await store.save(settings);
      showHome();
    };
  }

  async function startBrushing() {
    mouthViewContainer.style.visibility = 'visible';
    renderUI('');

    const pRes = createAutoProtocol(settings.duration, settings.zoneMode, settings.chewing);
    if (!pRes.ok) { alert("Error creating protocol: " + pRes.code); showHome(); return; }

    controller = new BrushingController(
      sm, mouthView, voice, sound, haptics, keepAwake, settings,
      (data) => updateBrushingUI(data, pRes.value)
    );
    await controller.start(pRes.value);
  }

  function updateBrushingUI(data: SessionData, protocol: any) {
    if (data.state === 'COMPLETED') { showComplete(data, protocol); return; }
    if (data.state === 'CANCELLED') { showHome(); return; }
    if (data.state === 'PAUSED')    { showPaused(); return; }

    const existingClock = document.getElementById('remaining-seconds');
    const existingZone = document.getElementById('current-zone');
    if (existingClock && existingZone && existingZone.dataset.state === data.state &&
        existingZone.dataset.zone === (data.currentZone ?? '')) {
      existingClock.textContent = String(data.remainingSeconds);
      return;
    }

    const currentLabel = data.state === 'COUNTDOWN'
      ? 'GET READY'
      : (data.currentZone ? zoneLabel(data.currentZone) : '');

    const nextIdx = data.currentZoneIndex + 1;
    const nextLabel = nextIdx < protocol.slots.length
      ? zoneLabel(protocol.slots[nextIdx].id)
      : 'Done!';

    const isChewing = data.currentZone?.includes('chewing');
    const headerColor = isChewing ? '#ff8f00' : '#007bff';

    renderUI(`
      <div style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:space-between; padding:20px; box-sizing:border-box; font-family:sans-serif; color:#333; pointer-events:none;">
        <div id="current-zone" data-state="${data.state}" data-zone="${data.currentZone ?? ''}" style="background:rgba(255,255,255,0.92); padding:12px 16px; border-radius:10px; text-align:center; font-weight:bold; font-size:20px; border-left:5px solid ${headerColor};">
          ${currentLabel}
          ${isChewing ? '<div style="font-size:13px; color:#888; font-weight:normal; margin-top:2px;">Top/chewing surface of back teeth</div>' : ''}
        </div>
        <div id="remaining-seconds" style="font-size:88px; font-weight:bold; text-align:center; color:white; text-shadow:0 2px 8px rgba(0,0,0,0.5);">
          ${data.remainingSeconds}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <button id="btn-pause" style="padding:14px 20px; font-size:17px; border-radius:8px; border:none; background:#ffc107; pointer-events:auto;">Pause</button>
          <div style="background:rgba(255,255,255,0.85); padding:8px 12px; border-radius:8px; font-size:13px; text-align:right; max-width:55%;">
            <div style="color:#888;">Next:</div>
            <div style="font-weight:bold;">${nextLabel}</div>
          </div>
        </div>
      </div>
    `);
    document.getElementById('btn-pause')!.onclick = () => controller?.pause();
  }

  function showPaused() {
    renderUI(`
      <div style="background: rgba(255,255,255,0.9); width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif; pointer-events: auto;">
        <h2>BRUSHING PAUSED</h2>
        <button id="btn-resume" style="padding:15px 30px; font-size:20px; margin: 10px; border-radius: 8px; border:none; background:#28a745; color:white;">Resume</button>
        <button id="btn-restart" style="padding:15px 30px; font-size:20px; margin: 10px; border-radius: 8px; border:1px solid #ccc; background:white;">Restart</button>
        <button id="btn-exit" style="padding:15px 30px; font-size:20px; margin: 10px; border-radius: 8px; border:none; background:#dc3545; color:white;">Exit</button>
      </div>
    `);
    document.getElementById('btn-resume')!.onclick = () => controller?.resume();
    document.getElementById('btn-restart')!.onclick = async () => { await controller?.cancel(); startBrushing(); };
    document.getElementById('btn-exit')!.onclick = () => { if (confirm("Are you sure you want to exit?")) controller?.cancel(); };
  }

  function showComplete(data: SessionData, protocol: any) {
    mouthViewContainer.style.visibility = 'hidden';
    const mins  = Math.floor(protocol.requestedBrushingDuration / 60);
    const sects = protocol.slots.length;
    renderUI(`
      <div style="background:white; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif; pointer-events:auto;">
        <div style="font-size:64px;">&#127881;</div>
        <h2 style="margin:8px 0;">BRUSHING COMPLETE!</h2>
        <p style="color:#555; font-size:18px;">You brushed all sections!</p>
        <div style="margin:16px 0; text-align:center; color:#333;">
          <div style="font-size:24px; font-weight:bold;">${mins} minute${mins !== 1 ? 's' : ''}</div>
          <div style="font-size:18px; color:#666;">${sects} sections completed</div>
        </div>
        <button id="btn-done" style="padding:16px 40px; font-size:20px; margin-top:16px; border-radius:10px; border:none; background:#007bff; color:white;">Done</button>
      </div>
    `);
    document.getElementById('btn-done')!.onclick = showHome;
  }
  
  // Background/Foreground handling
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && controller) {
      const data = sm.getSessionData();
      if (data.state === 'COUNTDOWN' || data.state === 'BRUSHING' || data.state === 'ZONE_TRANSITION') {
        controller.pause();
      }
    }
  });

  showHome();
}

init();
