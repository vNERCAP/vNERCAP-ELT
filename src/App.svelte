<script>
  import { onMount, onDestroy } from 'svelte';
  import { fetchVatsimFlight, bearingBetween, haversineDistanceNm } from './services/signalApi';

  let frequency = 121.5;
  let modulation = 'AM';
  let power = 5;
  let altitude = 4500;
  let updateRate = 2;
  let view = 'admin';
  let callsigns = ['CAP606', '', '', '', '', ''];
  let aircraftList = [];
  let lastVatsimUpdate = '';
  let vatsimError = '';
  let eltLat = 39.5;
  let eltLon = -104.7;
  let isActive = false;
  let bearing = 0;
  let strength = 50;
  let sweep = 0;
  let timer = null;
  let vatsimTimer = null;
  let logs = [];

  const modulationModes = ['AM', 'FM'];
  const views = [
    { id: 'admin', label: 'Admin console' },
    { id: 'crew', label: 'Crew cockpit' }
  ];

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const logEvent = (message) => {
    const entry = { id: crypto.randomUUID(), message, ts: new Date().toLocaleTimeString() };
    logs = [entry, ...logs].slice(0, 50);
  };

  const stopSim = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    isActive = false;
    logEvent('ELT simulation stopped');
  };

  const pollVatsim = async () => {
    const active = callsigns.map((c) => c.trim()).filter(Boolean);
    if (!active.length) {
      aircraftList = [];
      return;
    }
    const results = await Promise.allSettled(active.map((cs) => fetchVatsimFlight(cs)));
    const successes = [];
    let errors = [];
    results.forEach((res, idx) => {
      const cs = active[idx];
      if (res.status === 'fulfilled') {
        successes.push(res.value);
      } else {
        errors.push(`${cs}: ${res.reason?.message || 'error'}`);
      }
    });
    aircraftList = successes;
    vatsimError = errors.join(' | ');
    lastVatsimUpdate = new Date().toLocaleTimeString();
  };

  const computeSignal = () => {
    const beaconValid = Number.isFinite(eltLat) && Number.isFinite(eltLon);
    if (aircraftList.length && beaconValid) {
      const byDistance = aircraftList
        .map((ac) => ({
          ...ac,
          dist: haversineDistanceNm(ac.lat, ac.lon, eltLat, eltLon)
        }))
        .sort((a, b) => a.dist - b.dist);
      const target = byDistance[0];
      const relBearing = Math.round(bearingBetween(target.lat, target.lon, eltLat, eltLon));
      const distNm = target.dist;
      bearing = (relBearing + 360) % 360;
      const rawStrength = clamp(100 - distNm * 2 - Math.max(0, (altitude - 3000) / 2000), 5, 99);
      strength = Math.round(rawStrength);
      sweep = (sweep + 15) % 360;
      logEvent(`Ping ${bearing}° | ${target.callsign} | strength ${strength}% | dist ~${distNm.toFixed(1)}nm`);
    } else {
      sweep = (sweep + 15) % 360;
      bearing = Math.floor(Math.random() * 360);
      strength = clamp(Math.round(40 + power * 6 + Math.random() * 10 - 5), 5, 99);
      logEvent(`Ping @ bearing ${bearing}° | strength ${strength}% (no VATSIM fix)`);
    }
  };

  const startSim = () => {
    stopSim();
    isActive = true;
    logEvent('ELT simulation started');
    timer = setInterval(() => {
      computeSignal();
    }, Math.max(250, 1000 / updateRate));
  };

  const directionHint = (deg) => {
    if (deg >= 330 || deg <= 30) return 'On course';
    if (deg > 30 && deg <= 150) return 'Drift right';
    if (deg > 210 && deg < 330) return 'Drift left';
    return 'Behind';
  };

  const sectorHint = (deg) => {
    const sectors = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const noisy = (deg + (Math.random() * 30 - 15) + 360) % 360; // jitter for imprecision
    return sectors[Math.floor(noisy / 45)];
  };

  const toggle = () => (isActive ? stopSim() : startSim());

  onMount(() => {
    pollVatsim();
    vatsimTimer = setInterval(pollVatsim, 15000);
  });

  onDestroy(() => {
    stopSim();
    if (vatsimTimer) clearInterval(vatsimTimer);
  });
</script>

<main class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-10 flex justify-center">
  <div class="w-full max-w-5xl space-y-8">
    <header class="flex flex-col gap-3">
      <div class="inline-flex items-center gap-2 text-sm font-medium text-sky-300">
        <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
        ELT Simulation Tool for MSFS / X-Plane / Prepar3D
      </div>
      <h1 class="text-3xl md:text-4xl font-semibold tracking-tight text-white">vNERCAP ELT Simulator</h1>
      <p class="text-slate-300 max-w-3xl">
        Configure a virtual ELT beacon, watch relative bearings and signal strength, and practice CAP-style search.
      </p>

      <div class="inline-flex rounded-full bg-slate-900 border border-slate-800 p-1 w-fit">
        {#each views as option}
          <button
            class={`px-4 py-2 text-sm font-semibold rounded-full transition ${view === option.id ? 'bg-slate-800 text-white shadow-md shadow-black/30' : 'text-slate-400 hover:text-slate-200'}`}
            on:click={() => (view = option.id)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </header>

    {#if view === 'admin'}
      <section class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2 space-y-6">
          <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/40 space-y-4">
            <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h2 class="text-xl font-semibold text-white">Network + ELT position</h2>
                <p class="text-slate-400 text-sm">Pull up to 6 CAP aircraft from VATSIM every 15s; set beacon coordinates.</p>
              </div>
              <button class="btn-ghost" on:click={pollVatsim}>Refresh now</button>
            </div>

            <div class="grid gap-3 md:grid-cols-3">
              {#each callsigns as cs, idx}
                <label class="space-y-1">
                  <div class="flex items-center justify-between text-xs text-slate-400">
                    <span>Callsign #{idx + 1}</span>
                  </div>
                  <input class="input" bind:value={callsigns[idx]} placeholder="CAP606" />
                </label>
              {/each}
            </div>

            <div class="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2 text-sm text-slate-200">
              <div class="flex items-center justify-between">
                <span class="text-slate-400">Last update</span>
                <span class="font-semibold text-white">{lastVatsimUpdate || '—'}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-400">Status</span>
                <span class={`text-xs px-2 py-1 rounded-full ${vatsimError ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200'}`}>
                  {vatsimError ? 'With errors' : 'OK'}
                </span>
              </div>
              {#if vatsimError}
                <p class="text-xs text-amber-200">{vatsimError}</p>
              {/if}
              {#if aircraftList.length}
                <div class="grid gap-1 text-xs text-slate-300">
                  {#each aircraftList as ac}
                    <div class="flex items-center justify-between">
                      <span class="font-semibold text-slate-100">{ac.callsign}</span>
                      <span class="text-slate-400">{ac.lat?.toFixed(3)}, {ac.lon?.toFixed(3)} | Alt {ac.alt?.toFixed(0) ?? '—'}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <label class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-slate-200">ELT latitude</div>
                <input type="number" step="0.0001" class="input" bind:value={eltLat} />
              </label>
              <label class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-slate-200">ELT longitude</div>
                <input type="number" step="0.0001" class="input" bind:value={eltLon} />
              </label>
            </div>
            <p class="text-xs text-slate-500">Crew view only gets relative cues; exact coordinates stay in admin.</p>
          </div>
          <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/40">
            <div class="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h2 class="text-xl font-semibold text-white">Beacon configuration</h2>
                <p class="text-slate-400 text-sm">Set ELT transmit parameters and beacon power.</p>
              </div>
              <span class="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Training use only
              </span>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <label class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-slate-200">Frequency (MHz)</div>
                <input type="number" class="input" bind:value={frequency} step="0.1" min="0" />
              </label>
              <label class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-slate-200">Modulation</div>
                <select class="input" bind:value={modulation}>
                  {#each modulationModes as mode}
                    <option value={mode}>{mode}</option>
                  {/each}
                </select>
              </label>
              <label class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-slate-200">Power (W)</div>
                <input type="number" class="input" bind:value={power} min="1" max="10" />
              </label>
              <label class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-slate-200">Altitude (ft)</div>
                <input type="number" class="input" bind:value={altitude} step="100" />
              </label>
              <label class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-slate-200">Updates per second</div>
                <input type="number" class="input" bind:value={updateRate} min="1" max="10" />
              </label>
            </div>

            <div class="mt-6 flex flex-wrap gap-3">
              <button class="btn-primary" on:click={toggle}>
                {isActive ? 'Stop simulation' : 'Start simulation'}
              </button>
              <button class="btn-ghost" on:click={stopSim} disabled={!isActive}>Reset</button>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/40 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-lg font-semibold text-white">Signal telemetry</h3>
                <p class="text-slate-400 text-sm">Live bearings and strength estimations.</p>
              </div>
              <span class="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200 uppercase tracking-wide">
                {isActive ? 'Transmitting' : 'Idle'}
              </span>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div class="metric">
                <p class="metric-label">Bearing</p>
                <p class="metric-value">{bearing}°</p>
              </div>
              <div class="metric">
                <p class="metric-label">Signal strength</p>
                <p class="metric-value">{strength}%</p>
              </div>
              <div class="metric">
                <p class="metric-label">Sweep</p>
                <p class="metric-value">{sweep}°</p>
              </div>
            </div>

            <div class="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <h4 class="text-sm font-semibold text-slate-200 mb-2">Logs</h4>
              <div class="logs">
                {#if logs.length === 0}
                  <p class="text-slate-500 text-sm">No events yet. Start the simulation to stream pings.</p>
                {:else}
                  {#each logs as log}
                    <div class="log-line">
                      <span class="text-slate-400 text-xs">{log.ts}</span>
                      <span class="mx-2 text-slate-600">•</span>
                      <span class="text-slate-100">{log.message}</span>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          </div>
        </div>

        <aside class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/40 space-y-4">
          <h3 class="text-lg font-semibold text-white">Checklist</h3>
          <ul class="space-y-3 text-sm text-slate-300">
            <li class="flex items-start gap-3">
              <span class="badge">1</span>
              <div>
                <p class="font-semibold text-white">Launch sim + aircraft brief</p>
                <p class="text-slate-400">Load the SAR mission in MSFS, X-Plane, or P3D.</p>
              </div>
            </li>
            <li class="flex items-start gap-3">
              <span class="badge">2</span>
              <div>
                <p class="font-semibold text-white">Configure ELT</p>
                <p class="text-slate-400">Set frequency, modulation, and power per scenario.</p>
              </div>
            </li>
            <li class="flex items-start gap-3">
              <span class="badge">3</span>
              <div>
                <p class="font-semibold text-white">Start search leg</p>
                <p class="text-slate-400">Fly your planned pattern (expanding square, creeping line, sector, etc.).</p>
              </div>
            </li>
            <li class="flex items-start gap-3">
              <span class="badge">4</span>
              <div>
                <p class="font-semibold text-white">Log bearings</p>
                <p class="text-slate-400">Use telemetry pings to home in and report results.</p>
              </div>
            </li>
          </ul>

          <div class="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2 text-sm text-slate-200">
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Compliance</span>
              <span class="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">vNERCAP 1-1</span>
            </div>
            <p class="text-slate-300 leading-relaxed">
              Training only. No real-world SAR or emergency signaling. Follow VATSIM policy and local procedures.
            </p>
          </div>
        </aside>
      </section>
    {:else}
      <section class="grid gap-6 lg:grid-cols-5">
        <div class="lg:col-span-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/40 space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-xl font-semibold text-white">Cockpit DF receiver</h2>
              <p class="text-slate-400 text-sm">Simulated panel for bearing and signal strength.</p>
            </div>
            <span class="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300 uppercase tracking-wide">
              {isActive ? 'Signal live' : 'No signal'}
            </span>
          </div>

          <div class="grid gap-6 md:grid-cols-2">
            <div class="df-instrument">
              <div class="df-ring">
                <div class="df-tick north">N</div>
                <div class="df-tick east">E</div>
                <div class="df-tick south">S</div>
                <div class="df-tick west">W</div>
                <div class="df-arrow blurred" style={`transform: rotate(${bearing}deg);`}>
                  <div class="arrow-head" />
                  <div class="arrow-tail" />
                </div>
                <div class="df-center">
                  <p class="text-xs uppercase tracking-wide text-slate-400">Course cue</p>
                  <p class="text-lg font-semibold text-white">{directionHint(bearing)}</p>
                  <p class="text-[11px] text-slate-500 mt-1">Sector ~{sectorHint(bearing)}</p>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <div class="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div class="flex items-center justify-between text-sm text-slate-300">
                  <span>Signal strength</span>
                  <span class="font-semibold text-white">{strength}%</span>
                </div>
                <div class="mt-3 h-3 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-500 transition-all"
                    style={`width: ${strength}%;`}
                  />
                </div>
                <p class="mt-2 text-xs text-slate-500">Higher is closer to beacon or better line-of-sight.</p>
              </div>

              <div class="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2 text-sm text-slate-200">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Frequency</span>
                  <span class="font-semibold text-white">{frequency} MHz {modulation}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Update cadence</span>
                  <span class="font-semibold text-white">{updateRate} / sec</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400">Power estimate</span>
                  <span class="font-semibold text-white">{power} W</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/40 space-y-4">
          <h3 class="text-lg font-semibold text-white">In-cockpit flow</h3>
          <div class="space-y-3 text-sm text-slate-300">
            <div class="flow-step">
              <span class="badge">ADF</span>
              <div>
                <p class="font-semibold text-white">Tune 121.5 / 243.0</p>
                <p class="text-slate-400">Match admin frequency and modulation. Verify audio tone.</p>
              </div>
            </div>
            <div class="flow-step">
              <span class="badge">DF</span>
              <div>
                <p class="font-semibold text-white">Center the needle</p>
                <p class="text-slate-400">Turn until the arrow stabilizes; note drift on legs.</p>
              </div>
            </div>
            <div class="flow-step">
              <span class="badge">LOG</span>
              <div>
                <p class="font-semibold text-white">Call out bearings</p>
                <p class="text-slate-400">Record relative bearings and strength at checkpoints.</p>
              </div>
            </div>
            <div class="flow-step">
              <span class="badge">REPORT</span>
              <div>
                <p class="font-semibold text-white">Relay to mission base</p>
                <p class="text-slate-400">Share best fix, next turn, and estimated closure.</p>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3 text-sm text-slate-200">
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Status</span>
              <span class="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">{isActive ? 'Tracking' : 'Standby'}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Sweep angle</span>
              <span class="font-semibold text-white">{sweep}°</span>
            </div>
            <p class="text-slate-400 leading-relaxed">
              This view mirrors what crew would see on an ADF/DF receiver in the aircraft—use it to practice crew coordination.
            </p>
          </div>
        </aside>
      </section>
    {/if}
  </div>
</main>

<style>
  .input {
    @apply w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100 shadow-inner shadow-black/20 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40;
  }

  .btn-primary {
    @apply inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-sky-500 to-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-900/50 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-sky-900/60 active:translate-y-px;
  }

  .btn-ghost {
    @apply inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-700 hover:bg-slate-800;
  }

  .metric {
    @apply rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-inner shadow-black/30;
  }

  .metric-label {
    @apply text-xs uppercase tracking-wide text-slate-400;
  }

  .metric-value {
    @apply mt-1 text-2xl font-semibold text-white;
  }

  .logs {
    @apply space-y-2 text-sm max-h-64 overflow-y-auto;
  }

  .log-line {
    @apply flex items-center text-slate-200;
  }

  .badge {
    @apply inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200;
  }

  .df-instrument {
    @apply relative flex items-center justify-center;
  }

  .df-ring {
    @apply relative h-72 w-72 rounded-full border-2 border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-2xl shadow-black/50;
  }

  .df-center {
    @apply absolute inset-8 rounded-full border border-slate-800 bg-slate-950/80 flex flex-col items-center justify-center text-center shadow-inner shadow-black/40;
  }

  .df-tick {
    @apply absolute text-[11px] font-semibold text-slate-500;
  }

  .df-tick.north {
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
  }

  .df-tick.south {
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
  }

  .df-tick.east {
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
  }

  .df-tick.west {
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
  }

  .df-arrow {
    @apply absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out;
  }

  .arrow-head {
    @apply h-4 w-4 -translate-y-28 rotate-180 rounded-full bg-gradient-to-b from-sky-400 to-emerald-400 shadow-lg shadow-sky-900/60;
  }

  .arrow-tail {
    @apply absolute h-24 w-[3px] -translate-y-6 rounded-full bg-gradient-to-b from-sky-500 to-slate-700 shadow-inner shadow-black/40;
  }

  .blurred {
    filter: blur(0.4px);
  }

  .flow-step {
    @apply flex items-start gap-3;
  }
</style>
