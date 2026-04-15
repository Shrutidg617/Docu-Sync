import { useState } from "react";

const COLORS = ["#4F46E5", "#059669", "#DC2626", "#D97706", "#7C3AED", "#0891B2"];

function JoinScreen({ onJoin }) {
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Please enter your name");
      return;
    }

    onJoin({
      name: name.trim(),
      color: selectedColor,
    });
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1>DocuSync</h1>
        <p>Version-Controlled Collaborative Editor</p>

        <form onSubmit={handleSubmit} className="join-form">
          <label>Your Name</label>
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label>Select Your Color</label>
          <div className="color-row">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-dot ${selectedColor === color ? "selected" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>

          <button className="primary-btn" type="submit">
            Join Document
          </button>
        </form>
      </div>
    </div>
  );
}

export default JoinScreen;