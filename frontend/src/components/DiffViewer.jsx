import { diffLines, diffWords } from "diff";

function hexToRgba(hex, alpha) {
  if (!hex) return `rgba(79, 70, 229, ${alpha})`;

  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;

  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderWordDiff(oldChunk, newChunk, snapshotUserColor, currentUserColor) {
  const parts = diffWords(oldChunk || "", newChunk || "");

  return (
    <div className="word-diff-inline">
      {parts.map((part, index) => {
        if (part.added) {
          return (
            <span
              key={index}
              className="word-chip word-chip-added"
              style={{
                background: hexToRgba(currentUserColor || "#059669", 0.18),
                borderColor: currentUserColor || "#059669",
                color: currentUserColor || "#065f46",
              }}
            >
              {part.value}
            </span>
          );
        }

        if (part.removed) {
          return (
            <span
              key={index}
              className="word-chip word-chip-removed"
              style={{
                background: hexToRgba(snapshotUserColor || "#DC2626", 0.18),
                borderColor: snapshotUserColor || "#DC2626",
                color: snapshotUserColor || "#7f1d1d",
              }}
            >
              {part.value}
            </span>
          );
        }

        return (
          <span key={index} className="word-chip word-chip-normal">
            {part.value}
          </span>
        );
      })}
    </div>
  );
}

function DiffViewer({
  oldText,
  newText,
  snapshotUserName,
  snapshotUserColor,
  currentUserName,
  currentUserColor,
  onClose,
}) {
  const lineParts = diffLines(oldText || "", newText || "");

  const grouped = [];
  for (let i = 0; i < lineParts.length; i += 1) {
    const current = lineParts[i];
    const next = lineParts[i + 1];

    if (current?.removed && next?.added) {
      grouped.push({
        type: "modified",
        oldValue: current.value,
        newValue: next.value,
      });
      i += 1;
      continue;
    }

    if (current?.added) {
      grouped.push({
        type: "added",
        value: current.value,
      });
      continue;
    }

    if (current?.removed) {
      grouped.push({
        type: "removed",
        value: current.value,
      });
      continue;
    }

    grouped.push({
      type: "normal",
      value: current?.value || "",
    });
  }

  return (
    <div className="diff-card">
      <div className="diff-card-header">
        <div>
          <h3>Diff Preview</h3>
          <p>Compare selected snapshot with current document</p>
        </div>
        <button className="secondary-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="diff-user-row">
        <span
          className="mini-user-pill"
          style={{
            borderColor: snapshotUserColor || "#DC2626",
            color: snapshotUserColor || "#DC2626",
          }}
        >
          <span
            className="mini-user-dot"
            style={{ backgroundColor: snapshotUserColor || "#DC2626" }}
          />
          Snapshot: {snapshotUserName}
        </span>

        <span
          className="mini-user-pill"
          style={{
            borderColor: currentUserColor || "#059669",
            color: currentUserColor || "#059669",
          }}
        >
          <span
            className="mini-user-dot"
            style={{ backgroundColor: currentUserColor || "#059669" }}
          />
          Current: {currentUserName}
        </span>
      </div>

      <div className="diff-content">
        {grouped.map((block, index) => {
          if (block.type === "modified") {
            return (
              <div key={index} className="diff-block diff-block-modified">
                <div className="diff-block-label">Modified line</div>

                <div
                  className="diff-modified-section"
                  style={{
                    borderLeft: `6px solid ${snapshotUserColor || "#DC2626"}`,
                    background: hexToRgba(snapshotUserColor || "#DC2626", 0.12),
                  }}
                >
                  <div className="diff-side-label">Before</div>
                  {renderWordDiff(
                    block.oldValue,
                    "",
                    snapshotUserColor,
                    currentUserColor
                  )}
                </div>

                <div
                  className="diff-modified-section"
                  style={{
                    borderLeft: `6px solid ${currentUserColor || "#059669"}`,
                    background: hexToRgba(currentUserColor || "#059669", 0.12),
                  }}
                >
                  <div className="diff-side-label">After</div>
                  {renderWordDiff(
                    "",
                    block.newValue,
                    snapshotUserColor,
                    currentUserColor
                  )}
                </div>
              </div>
            );
          }

          if (block.type === "added") {
            return (
              <div
                key={index}
                className="diff-block diff-block-added"
                style={{
                  borderLeft: `6px solid ${currentUserColor || "#059669"}`,
                  background: hexToRgba(currentUserColor || "#059669", 0.14),
                }}
              >
                <div className="diff-block-label">Added in current version</div>
                <pre className="diff-pre">+ {block.value}</pre>
              </div>
            );
          }

          if (block.type === "removed") {
            return (
              <div
                key={index}
                className="diff-block diff-block-removed"
                style={{
                  borderLeft: `6px solid ${snapshotUserColor || "#DC2626"}`,
                  background: hexToRgba(snapshotUserColor || "#DC2626", 0.14),
                }}
              >
                <div className="diff-block-label">Removed from current version</div>
                <pre className="diff-pre">- {block.value}</pre>
              </div>
            );
          }

          return (
            <div key={index} className="diff-block diff-block-normal">
              <pre className="diff-pre">{block.value}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DiffViewer;