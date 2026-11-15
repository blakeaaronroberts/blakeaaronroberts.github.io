// The tools navigation: one list, one look, used by every tool's toolbar (Figure Editor, Timing Diagram, and any tool added later).

export const TOOLS = [["figure-editor", "Figure Editor"], ["timing-diagram", "Timing Diagram"]];

/** The navigation buttons for a toolbar, the current tool pressed. `extra` goes at the end of the group (the editor's help button). */
export const navHtml = (current, extra = "") =>
  `<div class="fe-group fe-group-end" role="navigation" aria-label="Tools">${TOOLS.map(([dir, name]) =>
    `<a class="btn btn-sm fe-btn" aria-pressed="${dir === current}"${dir === current ? ' aria-current="page"' : ""} href="../${dir}/">${name}</a>`).join("")}${extra}</div>`;
