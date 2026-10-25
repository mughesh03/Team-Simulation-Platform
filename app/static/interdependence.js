/**
 * Team Interdependence Models - SVG Visualization Library
 * Implements the 4 organizational interdependence models:
 *   1. Pooled Interdependence
 *   2. Sequential Interdependence
 *   3. Reciprocal Interdependence
 *   4. Comprehensive Interdependence
 *
 * Conforming strictly to reference specifications:
 * - Red circular nodes displaying ONLY numbers 1, 2, 3, 4 (no "Member" text)
 * - Blue rounded rectangles labeled "Output"
 * - Directional black arrows with accurate geometries and zero overlap
 * - Clean 2x2 responsive grid on a white background with clear titles and subtle shadows
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InterdependenceViz = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Configuration Constants
  const THEME = {
    nodeFill: '#d92938',         // Rich crimson red matching reference
    nodeRadius: 26,              // Prominent circular node size
    nodeTextColor: '#ffffff',
    nodeFontSize: 17.5,
    nodeFontWeight: '700',
    outputFill: '#1b6288',       // Deep slate ocean blue matching reference
    outputTextColor: '#ffffff',
    outputFontSize: 13,
    outputFontWeight: '600',
    outputWidth: 74,
    outputHeight: 34,
    outputRadius: 8,
    arrowColor: '#1a1a1a',       // Deep black directional arrows
    arrowStrokeWidth: 2.2,       // Crisp, visible line stroke
    blockArrowFill: '#1b6288',   // Blue block arrows matching reference
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  };

  const MODEL_META = {
    pooled: {
      id: 'pooled',
      name: 'Pooled',
      title: 'Pooled',
      titleLines: ['Pooled'],
      description: 'All members work independently and contribute their individual outputs to a shared common pool without direct member-to-member handoffs.',
      coordination: 'Standardization & Aggregation'
    },
    sequential: {
      id: 'sequential',
      name: 'Sequential',
      title: 'Sequential',
      titleLines: ['Sequential'],
      description: 'Work flows linearly in a fixed pipeline order (1 → 2 → 3 → 4 → Output). Each member depends directly on the output of the preceding member.',
      coordination: 'Plans, Schedules & Handoff Protocols'
    },
    reciprocal: {
      id: 'reciprocal',
      name: 'Reciprocal — Chain',
      title: 'Reciprocal — Chain',
      titleLines: ['Reciprocal — Chain'],
      description: 'Adjacent members exchange inputs and outputs bidirectionally in an iterative feedback loop, with final synthesis delivered to Output above the group.',
      coordination: 'Mutual Adjustment & Iterative Feedback'
    },
    comprehensive: {
      id: 'comprehensive',
      name: 'Team — Comprehensive',
      title: 'Team — Comprehensive',
      titleLines: ['Team — Comprehensive'],
      description: 'Arranged in a 2×2 grid where every pair of members is interconnected with bidirectional arrows for full swarm consensus, delivering final collective output to the right.',
      coordination: 'Continuous Mutual Adjustment & Group Consensus'
    }
  };

  let idCounter = 0;

  /**
   * Helper to generate unique SVG element IDs.
   * Strips all spaces, dashes, and non-alphanumeric characters to guarantee
   * valid XML ID syntax and avoid url(#...) lookup failures in CSS/SVG.
   */
  function uniqueId(prefix) {
    idCounter++;
    const safePrefix = String(prefix || 'iv').toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `${safePrefix}_${idCounter}_${Math.random().toString(36).substring(2, 7)}`;
  }

  /**
   * Generates defs (markers, filters)
   */
  function generateDefs(uid, animated) {
    return `
      <defs>
        <!-- Soft subtle drop shadow for circular nodes and output rectangle -->
        <filter id="shadow-${uid}" x="-25%" y="-25%" width="155%" height="155%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-color="#000000" flood-opacity="0.16"/>
        </filter>
        <filter id="blockArrowShadow-${uid}" x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.14"/>
        </filter>

        <!-- Prominent crisp black directional arrow marker (end) -->
        <marker id="arrow-end-${uid}" markerWidth="8.5" markerHeight="8.5" refX="6.5" refY="3.5" orient="auto">
          <polygon points="0 0.8, 7.5 3.5, 0 6.2" fill="${THEME.arrowColor}"/>
        </marker>

        <!-- Prominent crisp black directional arrow marker (start) for bidirectional lines -->
        <marker id="arrow-start-${uid}" markerWidth="8.5" markerHeight="8.5" refX="1" refY="3.5" orient="auto">
          <polygon points="7.5 0.8, 0 3.5, 7.5 6.2" fill="${THEME.arrowColor}"/>
        </marker>

        ${animated ? `
        <radialGradient id="pulseGlow-${uid}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="1"/>
          <stop offset="100%" stop-color="#0284c7" stop-opacity="0"/>
        </radialGradient>
        ` : ''}
      </defs>
    `;
  }

  /**
   * Render single Node SVG
   */
  function renderNode(cx, cy, label, uid, interactive) {
    return `
      <g class="iv-node" data-node="${label}" style="cursor: ${interactive ? 'pointer' : 'default'};">
        <circle cx="${cx}" cy="${cy}" r="${THEME.nodeRadius}" 
                fill="${THEME.nodeFill}" 
                filter="url(#shadow-${uid})" 
                class="iv-node-circle"/>
        <text x="${cx}" y="${cy}" 
              fill="${THEME.nodeTextColor}" 
              font-family="${THEME.fontFamily}" 
              font-size="${THEME.nodeFontSize}" 
              font-weight="${THEME.nodeFontWeight}" 
              text-anchor="middle" 
              dominant-baseline="central" 
              class="iv-node-text">${label}</text>
      </g>
    `;
  }

  /**
   * Render Output Rectangle SVG
   */
  function renderOutput(x, y, uid) {
    const w = THEME.outputWidth;
    const h = THEME.outputHeight;
    const rx = THEME.outputRadius;
    return `
      <g class="iv-output" filter="url(#shadow-${uid})">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" 
              fill="${THEME.outputFill}" 
              class="iv-output-rect"/>
        <text x="${x + w / 2}" y="${y + h / 2}" 
              fill="${THEME.outputTextColor}" 
              font-family="${THEME.fontFamily}" 
              font-size="${THEME.outputFontSize}" 
              font-weight="${THEME.outputFontWeight}" 
              letter-spacing="0.2px" 
              text-anchor="middle" 
              dominant-baseline="central" 
              class="iv-output-text">Output</text>
      </g>
    `;
  }

  /**
   * Render Directional Arrow
   */
  function renderArrow(d, uid, bidirectional = false, extraClass = '') {
    const markerStart = bidirectional ? `marker-start="url(#arrow-start-${uid})"` : '';
    const markerEnd = `marker-end="url(#arrow-end-${uid})"`;
    return `<path d="${d}" fill="none" stroke="${THEME.arrowColor}" stroke-width="${THEME.arrowStrokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${markerStart} ${markerEnd} class="iv-flow-arrow ${extraClass}"/>`;
  }

  /**
   * Render Pooled Diagram SVG
   * 4 nodes at bottom (1, 2, 3, 4) independently pointing to Output centered above.
   */
  function renderPooledSVG(uid, options = {}) {
    const animated = !!options.animated;
    const interactive = !!options.interactive;
    const defs = generateDefs(uid, animated);

    const vbW = 400;
    const vbH = 170;

    const outX = (vbW - THEME.outputWidth) / 2; // 163
    const outY = 14;

    const nodeY = 132;
    const nodeXs = [45, 130, 270, 355];

    const arrows = [
      renderArrow(`M 68 116 L 172 50`, uid, false, 'iv-arrow-node-1'),
      renderArrow(`M 146 109 L 190 50`, uid, false, 'iv-arrow-node-2'),
      renderArrow(`M 254 109 L 210 50`, uid, false, 'iv-arrow-node-3'),
      renderArrow(`M 332 116 L 228 50`, uid, false, 'iv-arrow-node-4')
    ];

    const nodes = [
      renderNode(nodeXs[0], nodeY, '1', uid, interactive),
      renderNode(nodeXs[1], nodeY, '2', uid, interactive),
      renderNode(nodeXs[2], nodeY, '3', uid, interactive),
      renderNode(nodeXs[3], nodeY, '4', uid, interactive)
    ];

    const output = renderOutput(outX, outY, uid);

    let animParticles = '';
    if (animated) {
      animParticles = `
        <circle r="4" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 68 116 L 172 50" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle r="4" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 146 109 L 190 50" dur="2.2s" repeatCount="indefinite" begin="0.3s" />
        </circle>
        <circle r="4" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 254 109 L 210 50" dur="2.2s" repeatCount="indefinite" begin="0.6s" />
        </circle>
        <circle r="4" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 332 116 L 228 50" dur="2.2s" repeatCount="indefinite" begin="0.9s" />
        </circle>
      `;
    }

    return `
      <svg class="iv-svg iv-svg-pooled" viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pooled Interdependence diagram">
        ${defs}
        <g class="iv-diagram-body">
          <g class="iv-arrows-group">${arrows.join('')}</g>
          <g class="iv-particles-group">${animParticles}</g>
          <g class="iv-nodes-group">${nodes.join('')}</g>
          <g class="iv-output-group">${output}</g>
        </g>
      </svg>
    `;
  }

  /**
   * Render Sequential Diagram SVG
   * 1 → 2 → 3 → 4 → Output in a horizontal pipeline.
   */
  function renderSequentialSVG(uid, options = {}) {
    const animated = !!options.animated;
    const interactive = !!options.interactive;
    const defs = generateDefs(uid, animated);

    const vbW = 420;
    const vbH = 130;
    const cy = 65;

    const nodeXs = [40, 125, 210, 295];
    const outX = 340;
    const outY = cy - THEME.outputHeight / 2;

    const arrows = [
      renderArrow(`M 68 65 L 97 65`, uid, false, 'iv-arrow-seq-1-2'),
      renderArrow(`M 153 65 L 182 65`, uid, false, 'iv-arrow-seq-2-3'),
      renderArrow(`M 238 65 L 267 65`, uid, false, 'iv-arrow-seq-3-4'),
      renderArrow(`M 323 65 L 337 65`, uid, false, 'iv-arrow-seq-4-out')
    ];

    const nodes = [
      renderNode(nodeXs[0], cy, '1', uid, interactive),
      renderNode(nodeXs[1], cy, '2', uid, interactive),
      renderNode(nodeXs[2], cy, '3', uid, interactive),
      renderNode(nodeXs[3], cy, '4', uid, interactive)
    ];

    const output = renderOutput(outX, outY, uid);

    let animParticles = '';
    if (animated) {
      animParticles = `
        <circle r="4" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 68 65 L 337 65" dur="3s" repeatCount="indefinite" />
        </circle>
      `;
    }

    return `
      <svg class="iv-svg iv-svg-sequential" viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sequential Interdependence diagram">
        ${defs}
        <g class="iv-diagram-body">
          <g class="iv-arrows-group">${arrows.join('')}</g>
          <g class="iv-particles-group">${animParticles}</g>
          <g class="iv-nodes-group">${nodes.join('')}</g>
          <g class="iv-output-group">${output}</g>
        </g>
      </svg>
    `;
  }

  /**
   * Render Reciprocal Diagram SVG
   * Expanded scale: 4 nodes at bottom (1, 2, 3, 4) with bold paired bidirectional arrows,
   * Output centered above with a prominent upward blue block arrow.
   */
  function renderReciprocalSVG(uid, options = {}) {
    const animated = !!options.animated;
    const interactive = !!options.interactive;
    const defs = generateDefs(uid, animated);

    // Tightened viewBox to match Pooled scale and enlarge elements
    const vbW = 400;
    const vbH = 170;

    const outX = (vbW - THEME.outputWidth) / 2; // 163
    const outY = 14;

    const nodeY = 132;
    const nodeXs = [45, 130, 270, 355];

    // Prominent upward blue block arrow pointing to Output
    const blockArrow = `
      <g filter="url(#blockArrowShadow-${uid})">
        <path d="M 191 96 L 191 70 L 181 70 L 200 50 L 219 70 L 209 70 L 209 96 Z" 
              fill="${THEME.blockArrowFill}" 
              class="iv-block-arrow-up"/>
      </g>
    `;

    // Paired anti-parallel arrows with prominent arrowheads
    // Top arrow (dy=-8) points LEFT (←)
    // Bottom arrow (dy=+8) points RIGHT (→)
    const yTop = nodeY - 8; // 124
    const yBot = nodeY + 8; // 140

    const arrows = [
      // 1 <-> 2
      renderArrow(`M 102 124 L 73 124`, uid, false, 'iv-arrow-rec-2-1'),
      renderArrow(`M 73 140 L 102 140`, uid, false, 'iv-arrow-rec-1-2'),

      // 2 <-> 3
      renderArrow(`M 242 124 L 158 124`, uid, false, 'iv-arrow-rec-3-2'),
      renderArrow(`M 158 140 L 242 140`, uid, false, 'iv-arrow-rec-2-3'),

      // 3 <-> 4
      renderArrow(`M 327 124 L 298 124`, uid, false, 'iv-arrow-rec-4-3'),
      renderArrow(`M 298 140 L 327 140`, uid, false, 'iv-arrow-rec-3-4')
    ];

    const nodes = [
      renderNode(nodeXs[0], nodeY, '1', uid, interactive),
      renderNode(nodeXs[1], nodeY, '2', uid, interactive),
      renderNode(nodeXs[2], nodeY, '3', uid, interactive),
      renderNode(nodeXs[3], nodeY, '4', uid, interactive)
    ];

    const output = renderOutput(outX, outY, uid);

    let animParticles = '';
    if (animated) {
      animParticles = `
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 73 140 L 102 140" dur="1.4s" repeatCount="indefinite" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 102 124 L 73 124" dur="1.4s" repeatCount="indefinite" begin="0.7s" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 158 140 L 242 140" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 242 124 L 158 124" dur="1.8s" repeatCount="indefinite" begin="0.9s" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 298 140 L 327 140" dur="1.4s" repeatCount="indefinite" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 327 124 L 298 124" dur="1.4s" repeatCount="indefinite" begin="0.7s" />
        </circle>
        <!-- Upward flow to output -->
        <circle r="4.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 200 96 L 200 50" dur="1.6s" repeatCount="indefinite" />
        </circle>
      `;
    }

    return `
      <svg class="iv-svg iv-svg-reciprocal" viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reciprocal Interdependence diagram">
        ${defs}
        <g class="iv-diagram-body">
          <g class="iv-arrows-group">${arrows.join('')}</g>
          <g class="iv-block-arrow-group">${blockArrow}</g>
          <g class="iv-particles-group">${animParticles}</g>
          <g class="iv-nodes-group">${nodes.join('')}</g>
          <g class="iv-output-group">${output}</g>
        </g>
      </svg>
    `;
  }

  /**
   * Render Comprehensive Diagram SVG
   * Enlarged 2×2 grid filling the canvas, with prominent bidirectional arrows on every pair,
   * Output positioned on the right with a bold blue block arrow.
   */
  function renderComprehensiveSVG(uid, options = {}) {
    const animated = !!options.animated;
    const interactive = !!options.interactive;
    const numbering = options.numbering || 'reference'; // 'reference' or 'linear'
    const defs = generateDefs(uid, animated);

    // Optimized viewBox: height 170 matches Pooled and Reciprocal exactly
    const vbW = 400;
    const vbH = 170;

    // Expanded 2x2 grid coordinates - significantly larger and bolder
    const leftX = 65;
    const rightX = 215;
    const topY = 38;
    const botY = 132;

    // Node labels
    let tlNum = '3', trNum = '4', blNum = '1', brNum = '2';
    if (numbering === 'linear') {
      tlNum = '1'; trNum = '2'; blNum = '3'; brNum = '4';
    }

    // Bidirectional arrows for all 6 pairs in complete graph K4
    // 1. Horizontal top (TL <-> TR)
    const arrowTop = renderArrow(`M 93 38 L 187 38`, uid, true, 'iv-arrow-comp-h-top');

    // 2. Horizontal bottom (BL <-> BR)
    const arrowBot = renderArrow(`M 93 132 L 187 132`, uid, true, 'iv-arrow-comp-h-bot');

    // 3. Vertical left (TL <-> BL)
    const arrowLeft = renderArrow(`M 65 66 L 65 104`, uid, true, 'iv-arrow-comp-v-left');

    // 4. Vertical right (TR <-> BR)
    const arrowRight = renderArrow(`M 215 66 L 215 104`, uid, true, 'iv-arrow-comp-v-right');

    // 5. Diagonal 1 (TL <-> BR)
    const arrowDiag1 = renderArrow(`M 89 53 L 191 117`, uid, true, 'iv-arrow-comp-diag-1');

    // 6. Diagonal 2 (BL <-> TR)
    const arrowDiag2 = renderArrow(`M 89 117 L 191 53`, uid, true, 'iv-arrow-comp-diag-2');

    // Output on the right
    const outX = 318;
    const outY = 68;

    // Prominent blue block arrow pointing right to Output
    const blockArrow = `
      <g filter="url(#blockArrowShadow-${uid})">
        <path d="M 252 77 L 285 77 L 285 68 L 308 85 L 285 102 L 285 93 L 252 93 Z" 
              fill="${THEME.blockArrowFill}" 
              class="iv-block-arrow-right"/>
      </g>
    `;

    const nodes = [
      renderNode(leftX, topY, tlNum, uid, interactive),
      renderNode(rightX, topY, trNum, uid, interactive),
      renderNode(leftX, botY, blNum, uid, interactive),
      renderNode(rightX, botY, brNum, uid, interactive)
    ];

    const output = renderOutput(outX, outY, uid);

    let animParticles = '';
    if (animated) {
      animParticles = `
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 93 38 L 187 38" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 187 38 L 93 38" dur="2s" repeatCount="indefinite" begin="1s" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 93 132 L 187 132" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 187 132 L 93 132" dur="2s" repeatCount="indefinite" begin="1s" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 65 66 L 65 104" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 215 66 L 215 104" dur="2s" repeatCount="indefinite" begin="0.5s" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 89 53 L 191 117" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle r="3.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 89 117 L 191 53" dur="2.4s" repeatCount="indefinite" begin="1.2s" />
        </circle>
        <!-- Arrow to output -->
        <circle r="4.5" fill="#38bdf8" class="iv-pulse">
          <animateMotion path="M 252 85 L 310 85" dur="1.8s" repeatCount="indefinite" />
        </circle>
      `;
    }

    return `
      <svg class="iv-svg iv-svg-comprehensive" viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Comprehensive Interdependence diagram">
        ${defs}
        <g class="iv-diagram-body">
          <g class="iv-arrows-group">
            ${arrowTop}
            ${arrowBot}
            ${arrowLeft}
            ${arrowRight}
            ${arrowDiag1}
            ${arrowDiag2}
          </g>
          <g class="iv-block-arrow-group">${blockArrow}</g>
          <g class="iv-particles-group">${animParticles}</g>
          <g class="iv-nodes-group">${nodes.join('')}</g>
          <g class="iv-output-group">${output}</g>
        </g>
      </svg>
    `;
  }

  /**
   * Main function to get SVG markup for any model
   */
  function getDiagramSVG(type, options = {}) {
    const raw = String(type || '').toLowerCase().trim();
    let norm = 'pooled';
    if (raw.includes('pool')) norm = 'pooled';
    else if (raw.includes('seq')) norm = 'sequential';
    else if (raw.includes('comp') || raw.includes('all') || raw.includes('team')) norm = 'comprehensive';
    else if (raw.includes('recip')) norm = 'reciprocal';

    const uid = options.uid || uniqueId(norm);

    if (norm === 'pooled') {
      return renderPooledSVG(uid, options);
    }
    if (norm === 'sequential') {
      return renderSequentialSVG(uid, options);
    }
    if (norm === 'reciprocal') {
      return renderReciprocalSVG(uid, options);
    }
    if (norm === 'comprehensive') {
      return renderComprehensiveSVG(uid, options);
    }
    return renderPooledSVG(uid, options);
  }

  /**
   * Renders a single model card HTML
   */
  function renderCardHTML(typeKey, options = {}) {
    const meta = MODEL_META[typeKey];
    const svg = getDiagramSVG(typeKey, options);

    return `
      <article class="iv-card" data-model="${meta.id}" tabindex="0">
        <div class="iv-card-content">
          <div class="iv-title-col">
            <h3 class="iv-model-title">
              ${(meta.titleLines || []).map(line => `<span>${line}</span>`).join('')}
            </h3>
            ${options.showBadges ? `
              <div class="iv-meta-tag">${meta.coordination}</div>
            ` : ''}
          </div>
          <div class="iv-diagram-col">
            <div class="iv-svg-wrapper">
              ${svg}
            </div>
          </div>
        </div>
        ${options.showDescriptions ? `
          <div class="iv-card-footer">
            <p class="iv-description">${meta.description}</p>
          </div>
        ` : ''}
      </article>
    `;
  }

  /**
   * Renders the complete 2×2 grid layout strictly following the reference image:
   * Row 1: Pooled (Top-Left)       | Reciprocal (Top-Right)
   * Row 2: Sequential (Bottom-Left) | Comprehensive (Bottom-Right)
   */
  function render2x2GridHTML(options = {}) {
    const order = ['pooled', 'sequential', 'reciprocal', 'comprehensive'];
    const cards = order.map(k => renderCardHTML(k, options)).join('\n');

    return `
      <section class="iv-grid-container" aria-label="Team Interdependence Models 2x2 Grid">
        ${cards}
      </section>
    `;
  }

  /**
   * Injects the required CSS stylesheet if not already present
   */
  function injectStyles() {
    if (document.getElementById('interdependence-viz-styles')) return;

    const css = `
      /* ── Interdependence 2×2 Grid Styles ── */
      .iv-grid-container {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 36px 48px;
        background: #ffffff;
        padding: 40px;
        border-radius: 16px;
        box-shadow: 0 4px 24px -2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04);
        max-width: 1200px;
        margin: 0 auto;
        box-sizing: border-box;
      }

      /* Single Card */
      .iv-card {
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #f1f5f9;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
        padding: 24px 28px;
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: 220px;
        outline: none;
      }

      .iv-card:hover, .iv-card:focus-visible {
        box-shadow: 0 8px 24px -4px rgba(15, 23, 42, 0.09);
        border-color: #cbd5e1;
        transform: translateY(-2px);
      }

      .iv-card-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        width: 100%;
      }

      /* Title Column on Left matching reference image */
      .iv-title-col {
        flex: 0 0 150px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        text-align: right;
      }

      .iv-model-title {
        margin: 0;
        font-family: ${THEME.fontFamily};
        font-size: 1.15rem;
        font-weight: 700;
        line-height: 1.25;
        color: #1e293b;
        letter-spacing: -0.01em;
        display: flex;
        flex-direction: column;
      }

      .iv-meta-tag {
        margin-top: 8px;
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #64748b;
        background: #f8fafc;
        padding: 3px 8px;
        border-radius: 4px;
        border: 1px solid #e2e8f0;
        align-self: flex-end;
      }

      /* Diagram Column on Right */
      .iv-diagram-col {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .iv-svg-wrapper {
        width: 100%;
        max-width: 380px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .iv-svg {
        width: 100%;
        height: auto;
        max-height: 190px;
        display: block;
        overflow: visible;
      }

      /* SVG Micro-interactions */
      .iv-node {
        transition: transform 0.18s ease;
      }
      .iv-node:hover {
        transform: scale(1.08);
      }
      .iv-node-circle {
        transition: filter 0.18s ease;
      }
      .iv-node:hover .iv-node-circle {
        filter: drop-shadow(0 4px 8px rgba(217, 41, 56, 0.45));
      }

      .iv-output {
        transition: transform 0.18s ease;
      }
      .iv-output:hover {
        transform: scale(1.04);
      }

      .iv-card-footer {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid #f1f5f9;
      }

      .iv-description {
        margin: 0;
        font-size: 0.85rem;
        line-height: 1.45;
        color: #475569;
      }

      /* Responsive Breakpoint for Mobile and Narrow Screens */
      @media (max-width: 860px) {
        .iv-grid-container {
          grid-template-columns: 1fr;
          gap: 24px;
          padding: 24px 16px;
        }

        .iv-card {
          padding: 20px 16px;
        }

        .iv-card-content {
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .iv-title-col {
          flex: none;
          text-align: center;
          align-items: center;
        }

        .iv-model-title {
          flex-direction: row;
          gap: 6px;
          font-size: 1.1rem;
        }

        .iv-meta-tag {
          align-self: center;
        }

        .iv-svg-wrapper {
          max-width: 100%;
        }

        .iv-svg {
          max-height: 160px;
        }
      }

      @media (max-width: 480px) {
        .iv-grid-container {
          padding: 16px 8px;
          border-radius: 8px;
        }

        .iv-card {
          padding: 16px 10px;
        }

        .iv-svg {
          max-height: 140px;
        }
      }
    `;

    const styleEl = document.createElement('style');
    styleEl.id = 'interdependence-viz-styles';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // Public API
  return {
    THEME,
    MODEL_META,
    getDiagramSVG,
    renderCardHTML,
    render2x2GridHTML,
    injectStyles,

    /**
     * Mounts the 2x2 grid inside a specified DOM container
     */
    mount: function (container, options = {}) {
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!el) {
        console.warn('InterdependenceViz: container element not found', container);
        return;
      }
      injectStyles();
      el.innerHTML = render2x2GridHTML(options);
    }
  };
});
