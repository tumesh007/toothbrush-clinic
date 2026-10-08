import { MouthView } from './MouthView';
import { SessionStateMachine } from './protocol/StateMachine';
import { BrushingController } from './BrushingController';
import { LocalStorageSettingsStore, WebVoicePort, WebSoundPort, WebHapticPort, WebKeepAwakePort } from './adapters';
import { createAutoProtocol } from './protocol/allocation';
import { SessionData } from './protocol/StateMachine';

class ClockAdapter {
  now() { return performance.now(); }
}

async function init() {
  const container = document.getElementById('app')!;
  
  const mouthViewContainer = document.createElement('div');
  mouthViewContainer.id = 'mouth-view-container';
  mouthViewContainer.style.width = '100%';
  mouthViewContainer.style.height = '100%';
  mouthViewContainer.style.position = 'absolute';
  mouthViewContainer.style.top = '0';
  mouthViewContainer.style.left = '0';
  mouthViewContainer.style.zIndex = '1';
  container.appendChild(mouthViewContainer);
  
  const mouthView = new MouthView(mouthViewContainer);

  const uiLayer = document.createElement('div');
  uiLayer.id = 'ui-layer';
  uiLayer.style.position = 'absolute';
  uiLayer.style.top = '0';
  uiLayer.style.left = '0';
  uiLayer.style.width = '100%';
  uiLayer.style.height = '100%';
  uiLayer.style.zIndex = '10';
  uiLayer.style.pointerEvents = 'none'; // Let clicks pass through where no UI
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
  
  function showHome() {
    mouthViewContainer.style.visibility = 'hidden';
    mouthView.resetCamera();
    mouthView.clearHighlight();
    
    renderUI(`
      <div style="background: white; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;">
        <h1>Toothbrush Clinic</h1>
        <p>${Math.floor(settings.duration / 60)} Minutes, ${settings.zoneMode} Sections ${settings.chewing ? '+ Chewing' : ''}</p>
        <button id="btn-start" style="padding:15px 30px; font-size:20px; margin: 10px; border-radius: 8px; border:none; background:#007bff; color:white;">Start Brushing</button>
        <button id="btn-settings" style="padding:15px 30px; font-size:20px; margin: 10px; border-radius: 8px; border:1px solid #ccc; background:white;">Settings</button>
      </div>
    `);
    
    document.getElementById('btn-start')!.onclick = startBrushing;
    document.getElementById('btn-settings')!.onclick = () => showParentGate(showSettings);
  }
  
  function showParentGate(onSuccess: () => void) {
    renderUI(`
      <div style="background: white; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;">
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
        if (btn.getAttribute('data-val') === '5') {
          onSuccess();
        } else {
          showHome();
        }
      };
    });
    
    document.getElementById('btn-cancel')!.onclick = showHome;
  }
  
  function showSettings() {
    renderUI(`
      <div style="background: white; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; padding-top: 20px; font-family:sans-serif; overflow-y:auto;">
        <h2>Settings</h2>
        <label><input type="checkbox" id="chk-voice" ${settings.voice ? 'checked' : ''}> Voice</label><br>
        <label><input type="checkbox" id="chk-sound" ${settings.sound ? 'checked' : ''}> Sound</label><br>
        <label><input type="checkbox" id="chk-haptics" ${settings.haptics ? 'checked' : ''}> Haptics</label><br>
        <label><input type="checkbox" id="chk-chewing" ${settings.chewing ? 'checked' : ''}> Chewing</label><br>
        <label>Duration: 
          <select id="sel-duration">
            <option value="120" ${settings.duration===120?'selected':''}>2 Minutes</option>
            <option value="180" ${settings.duration===180?'selected':''}>3 Minutes</option>
          </select>
        </label><br>
        <label>Zones:
          <select id="sel-zones">
            <option value="8" ${settings.zoneMode===8?'selected':''}>8 Zones</option>
            <option value="12" ${settings.zoneMode===12?'selected':''}>12 Zones</option>
          </select>
        </label><br>
        <button id="btn-save" style="padding:15px 30px; font-size:20px; margin-top: 20px; border-radius: 8px; border:none; background:#28a745; color:white;">Save & Exit</button>
      </div>
    `);
    
    document.getElementById('btn-save')!.onclick = async () => {
      settings.voice = (document.getElementById('chk-voice') as HTMLInputElement).checked;
      settings.sound = (document.getElementById('chk-sound') as HTMLInputElement).checked;
      settings.haptics = (document.getElementById('chk-haptics') as HTMLInputElement).checked;
      settings.chewing = (document.getElementById('chk-chewing') as HTMLInputElement).checked;
      settings.duration = parseInt((document.getElementById('sel-duration') as HTMLSelectElement).value);
      settings.zoneMode = parseInt((document.getElementById('sel-zones') as HTMLSelectElement).value) as 8 | 12;
      
      mouthView.setCameraMode(settings.cameraMode);
      mouthView.setReducedMotion(settings.reducedAnimation);
      await store.save(settings);
      showHome();
    };
  }
  
  async function startBrushing() {
    mouthViewContainer.style.visibility = 'visible';
    renderUI(''); // clear UI
    
    const pRes = createAutoProtocol(settings.duration, settings.zoneMode, settings.chewing);
    if (!pRes.ok) {
      alert("Error creating protocol: " + pRes.code);
      showHome();
      return;
    }
    
    controller = new BrushingController(
      sm, mouthView, voice, sound, haptics, keepAwake, settings,
      (data) => updateBrushingUI(data, pRes.value)
    );
    
    await controller.start(pRes.value);
  }
  
  function updateBrushingUI(data: SessionData, protocol: any) {
    if (data.state === 'COMPLETED') {
      showComplete(data, protocol);
      return;
    }
    if (data.state === 'CANCELLED') {
      showHome();
      return;
    }
    if (data.state === 'PAUSED') {
      showPaused();
      return;
    }
    
    let text = data.state === 'COUNTDOWN' ? 'GET READY' : 
               (data.currentZone ? data.currentZone.toUpperCase().replace(/_/g, ' ') : '');
               
    renderUI(`
      <div style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:space-between; padding: 20px; box-sizing: border-box; font-family:sans-serif; color: #333;">
        <div style="background:rgba(255,255,255,0.8); padding: 10px; border-radius: 8px; text-align:center; font-weight:bold; font-size:24px;">
          ${text}
        </div>
        <div style="font-size: 80px; font-weight:bold; text-align:center; text-shadow: 2px 2px 4px rgba(255,255,255,0.8);">
          ${data.remainingSeconds}
        </div>
        <div style="display:flex; justify-content:space-between;">
          <button id="btn-pause" style="padding:15px; font-size:18px; border-radius:8px; border:none; background:#ffc107;">Pause</button>
          <div style="background:rgba(255,255,255,0.8); padding: 10px; border-radius: 8px; font-weight:bold;">
            Next: ${data.currentZoneIndex < protocol.slots.length - 1 ? protocol.slots[data.currentZoneIndex + 1]?.id.replace(/_/g, ' ') : 'Done'}
          </div>
        </div>
      </div>
    `);
    
    document.getElementById('btn-pause')!.onclick = () => controller?.pause();
  }
  
  function showPaused() {
    renderUI(`
      <div style="background: rgba(255,255,255,0.9); width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;">
        <h2>BRUSHING PAUSED</h2>
        <button id="btn-resume" style="padding:15px 30px; font-size:20px; margin: 10px; border-radius: 8px; border:none; background:#28a745; color:white;">Resume</button>
        <button id="btn-restart" style="padding:15px 30px; font-size:20px; margin: 10px; border-radius: 8px; border:1px solid #ccc; background:white;">Restart</button>
        <button id="btn-exit" style="padding:15px 30px; font-size:20px; margin: 10px; border-radius: 8px; border:none; background:#dc3545; color:white;">Exit</button>
      </div>
    `);
    
    document.getElementById('btn-resume')!.onclick = () => controller?.resume();
    document.getElementById('btn-restart')!.onclick = async () => {
      await controller?.cancel();
      startBrushing();
    };
    document.getElementById('btn-exit')!.onclick = () => {
      if (confirm("Are you sure you want to exit?")) {
        controller?.cancel();
      }
    };
  }
  
  function showComplete(data: SessionData, protocol: any) {
    mouthViewContainer.style.visibility = 'hidden';
    renderUI(`
      <div style="background: white; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;">
        <h2>BRUSHING COMPLETE</h2>
        <p>You brushed all sections!</p>
        <p>Time: ${data.elapsedSeconds} seconds</p>
        <p>Sections: ${protocol.slots.length} / ${protocol.slots.length}</p>
        <button id="btn-done" style="padding:15px 30px; font-size:20px; margin: 10px; border-radius: 8px; border:none; background:#007bff; color:white;">Done</button>
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
