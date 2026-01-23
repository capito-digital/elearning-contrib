import ComponentView from 'core/js/views/componentView';
import Adapt from 'core/js/adapt';

// Inject minimal styles for overlay and spacing
function injectStyles() {
    if (document.getElementById('stt-widget-styles')) return;
    const css = `
    .stt-wrap { position: relative; }
    .stt-overlay {
      position: absolute;
      z-index: 2;
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%;
      background: rgba(0,0,0,0.06);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.08) inset;
      cursor: pointer;
      user-select: none;
    }
    .stt-overlay .stt-btn {
      border: none; background: transparent; width: 22px; height: 22px;
      display:flex; align-items:center; justify-content:center;
      font-size: 14px; line-height: 1;
    }
    .stt-overlay .stt-bars { width: 22px; height: 14px; display: none; align-items: flex-end; gap: 2px; }
    .stt-overlay .stt-bar { width: 2px; background: #6aa9ff; height: 4px; border-radius: 2px; transition: height .12s ease; }
    .stt-recording .stt-btn { display: none; }
    .stt-recording .stt-bars { display: inline-flex; }
  `;
    const style = document.createElement('style');
    style.id = 'stt-widget-styles';
    style.textContent = css;
    document.head.appendChild(style);
}

function createBars() {
    const bars = document.createElement('div');
    bars.className = 'stt-bars';
    for (let i = 0; i < 8; i++) {
        const b = document.createElement('div');
        b.className = 'stt-bar';
        bars.appendChild(b);
    }
    return bars;
}

// Compute overlay position inside the control's content box
function positionOverlayForField(wrapper) {
    const field = wrapper.querySelector('textarea, input[type="text"]');
    const overlay = wrapper.querySelector('.stt-overlay');
    if (!field || !overlay) return;

    const fieldStyles = getComputedStyle(field);
    const wrapRect = wrapper.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();

    // Field position within wrapper
    const fieldLeftInWrap = fieldRect.left - wrapRect.left;
    const fieldTopInWrap = fieldRect.top - wrapRect.top;

    const padRight = parseFloat(fieldStyles.paddingRight) || 0;
    const padTop = parseFloat(fieldStyles.paddingTop) || 0;
    const padBottom = parseFloat(fieldStyles.paddingBottom) || 0;
    const borderRight = parseFloat(fieldStyles.borderRightWidth) || 0;
    const borderTop = parseFloat(fieldStyles.borderTopWidth) || 0;

    // Target insets
    const inset = 6; // distance from content edge

    // Desired x: inside right content edge
    const x = fieldLeftInWrap + fieldRect.width - (borderRight + padRight) - inset;

    // Measure overlay
    const prevVis = overlay.style.visibility;
    overlay.style.visibility = 'hidden';
    overlay.style.left = '0px';
    overlay.style.top = '0px';
    const overlayRect = overlay.getBoundingClientRect();
    overlay.style.visibility = prevVis || '';

    const isTextarea = field.tagName.toLowerCase() === 'textarea';

    // Desired y:
    // - textarea: top-right corner inside content box
    // - input: vertically centered along content area
    let y;
    if (isTextarea) {
        y = fieldTopInWrap + borderTop + padTop + inset;
    } else {
        const contentTop = fieldTopInWrap + borderTop + padTop;
        const contentBottom = fieldTopInWrap + fieldRect.height - (parseFloat(fieldStyles.borderBottomWidth) || 0) - padBottom;
        const contentMid = contentTop + (contentBottom - contentTop) / 2;
        y = contentMid - overlayRect.height / 2;
    }

    let left = (x - overlayRect.width);
    left += 30; // todo figure out why this is needed
    overlay.style.right = 'auto';
    overlay.style.left = left + 'px';
    overlay.style.top = Math.max(y, 0) + 'px';
    overlay.style.transform = '';
}

function setupOverlayObservers(wrapper) {
    const reposition = () => positionOverlayForField(wrapper);
    // Initial
    requestAnimationFrame(reposition);
    // Resize observers
    if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(reposition);
        const field = wrapper.querySelector('textarea, input[type="text"]');
        if (field) ro.observe(field);
        ro.observe(wrapper);
        wrapper.__sttRO = ro;
    }
    // Window resize
    window.addEventListener('resize', reposition);
    wrapper.__sttWin = reposition;
}

function createOverlayWidget(targetInput) {
    const overlay = document.createElement('div');
    overlay.className = 'stt-overlay';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stt-btn';
    btn.title = 'Start/Stop recording';
    btn.setAttribute('aria-label', 'Start or stop recording');
    btn.textContent = '🎤';

    const bars = createBars();

    overlay.appendChild(btn);
    overlay.appendChild(bars);

    let rec = null;
    let vizTimer = null;

    function setRecordingUI(isRecording) {
        if (isRecording) {
            overlay.classList.add('stt-recording');
            vizTimer = setInterval(() => {
                Array.from(bars.children).forEach((bar) => {
                    const h = 4 + Math.floor(Math.random() * 12);
                    bar.style.height = h + 'px';
                });
            }, 120);
        } else {
            overlay.classList.remove('stt-recording');
            if (vizTimer) clearInterval(vizTimer);
            vizTimer = null;
        }
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
            const chunks = [];
            rec = new MediaRecorder(stream);
            rec.ondataavailable = (e) => {
                if (e.data && e.data.size) chunks.push(e.data);
            };
            rec.onstop = async () => {
                try {
                    const audioBlob = new Blob(chunks, {type: 'audio/wav'});
                    const formData = new FormData();
                    formData.append('audio_file', audioBlob, 'recording.wav');
                    const baseUrl = (Adapt.course?.get('_globals') || {})._dashboardBaseUrl || Adapt.config.dashboardBaseUrl || '';
                    const resp = await fetch(`${baseUrl}/public/v1/audio/speech-to-text`, {
                        method: 'POST',
                        body: formData
                    });
                    if (!resp.ok) throw new Error('Transcription request failed: ' + resp.status);
                    const response = await resp.json();
                    const result = response['text'];
                    if (targetInput) {
                        const isEmpty = !targetInput.value || targetInput.value.length === 0;
                        targetInput.value = isEmpty ? result : (targetInput.value + ' ' + result);
                        targetInput.dispatchEvent(new Event('input', {bubbles: true}));
                        targetInput.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                } catch (err) {
                    console.error(err);
                } finally {
                    setRecordingUI(false);
                }
            };
            rec.start();
            setRecordingUI(true);
        } catch (err) {
            console.error('Mic error', err);
        }
    }

    function toggleRecording() {
        if (rec && rec.state === 'recording') rec.stop();
        else startRecording();
    }

    btn.addEventListener('click', toggleRecording);
    overlay.addEventListener('click', (e) => {
        if (e.target === btn) return;
        toggleRecording();
    });

    setRecordingUI(false);
    return overlay;
}

class UserTranscribeView extends ComponentView {
    postRender() {
        // Wait for potential loading indicator to finish before attaching
        let pollId = null;
        let started = false;
        const checkAndInit = () => {
            const el = document.getElementsByClassName('loading');
            const is_loading = el.length !== 0 && el[0].style.display !== 'none';
            if (is_loading) {
                started = true;
            } else if (started) {
                clearInterval(pollId);
                pollId = null;
                this.addUserTranscribeButtons();
            }
        };
        pollId = setInterval(checkAndInit, 5);
        checkAndInit();
        this.setReadyStatus();
        Adapt.on('trickle:contentRevealed', () => this.addUserTranscribeButtons());
    }

    addUserTranscribeButtons() {
        try {
            injectStyles();

            const containers = document.querySelectorAll('.transcribe-content');
            containers.forEach((container) => {
                // pick textarea or input
                let target = container.matches('textarea, input[type="text"]')
                    ? container
                    : container.querySelector('textarea, input[type="text"]');
                if (!target) return;
                if (target.dataset.sttAttached === '1') return;

                // Wrap the target in a positioned wrapper to allow absolute overlay
                const wrapper = document.createElement('div');
                wrapper.className = 'stt-wrap';

                // Insert wrapper before target and move target inside
                const parent = target.parentNode;
                parent.insertBefore(wrapper, target);
                wrapper.appendChild(target);

                // Create overlay widget
                const overlay = createOverlayWidget(target);
                wrapper.appendChild(overlay);

                // Ensure text doesn't go under the overlay by increasing right padding minimally
                // We add overlay width + small gap on the field's inline style without breaking existing padding
                const cs = getComputedStyle(target);
                const currentPadRight = parseFloat(cs.paddingRight) || 0;
                const padBump = 28 + 8; // overlay width + gap
                // Only bump if existing padding is smaller
                if (currentPadRight < padBump) {
                    target.style.paddingRight = padBump + 'px';
                }

                // Position overlay precisely and keep it in place
                setupOverlayObservers(wrapper);

                // Fonts may affect sizes
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(() => positionOverlayForField(wrapper)).catch(() => {
                    });
                }

                // Mark attached
                target.dataset.sttAttached = '1';
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('UserTranscribeView.addUserTranscribeButtons error', e);
        }
    }
}
UserTranscribeView.template = 'user-transcribe.jsx';
export default UserTranscribeView;