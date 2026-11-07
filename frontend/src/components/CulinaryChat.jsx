import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const STARTERS = [
  "What can I cook with chicken and rice?",
  "Help me make a quick vegetarian dinner",
  "Find a breakfast recipe in Culinary"
];

export default function CulinaryChat() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => () => requestRef.current?.abort(), []);

  function openChat() {
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function sendMessage(event, submittedText = draft, isRetry = false) {
    event?.preventDefault();
    const text = submittedText.trim();
    if (!text || pending) return;

    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const priorMessages = (isRetry ? messages.slice(0, -1) : messages).slice(-8);
    const userMessage = { role: "user", text };

    if (!isRetry) {
      setMessages((previous) => [...previous, userMessage].slice(-16));
    }
    setDraft("");
    setError("");
    setPending(true);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: priorMessages })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Culinary AI could not answer right now.");
      if (controller.signal.aborted) return;
      setMessages((previous) => [...previous, {
        role: "model",
        text: data.message,
        recipes: Array.isArray(data.recipes) ? data.recipes : []
      }].slice(-16));
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.message);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function retry() {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
    if (lastUserMessage) sendMessage(undefined, lastUserMessage.text, true);
  }

  return (
    <aside className={`culinary-chat ${open ? "is-open" : ""}`} aria-label="Ask Culinary">
      <button className="culinary-chat-trigger" type="button" onClick={openChat} aria-expanded={open}>
        <span aria-hidden="true">✦</span> Ask Culinary
      </button>
      <div className="culinary-chat-panel" role="region" aria-label="Ask Culinary chat">
        <header className="culinary-chat-header">
          <div>
            <p className="culinary-chat-kicker">Cooking companion</p>
            <h2>Ask Culinary</h2>
          </div>
          <div className="culinary-chat-header-actions">
            <button type="button" className="culinary-chat-text-button" onClick={() => { setMessages([]); setError(""); }} disabled={pending || messages.length === 0}>
              New chat
            </button>
            <button type="button" className="culinary-chat-close" onClick={() => setOpen(false)} aria-label="Close Ask Culinary">
              ×
            </button>
          </div>
        </header>

        <div className="culinary-chat-messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="culinary-chat-welcome">
              <p>Tell me what you have, what you are craving, or ask about a recipe.</p>
              <div className="culinary-chat-starters">
                {STARTERS.map((starter) => (
                  <button key={starter} type="button" onClick={() => sendMessage(undefined, starter)} disabled={pending}>
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`culinary-chat-message ${message.role}`} key={`${message.role}-${index}`}>
              <p>{message.text}</p>
              {message.recipes?.map((recipe) => (
                <Link className="culinary-chat-recipe" to={`/recipes/${recipe.id}`} key={recipe.id}>
                  {recipe.imageUrl && <img src={recipe.imageUrl} alt="" />}
                  <span><strong>{recipe.title}</strong><small>{recipe.description}</small></span>
                </Link>
              ))}
            </div>
          ))}
          {pending && <p className="culinary-chat-thinking" role="status">Culinary is thinking…</p>}
          {error && (
            <div className="culinary-chat-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={retry} disabled={pending || messages.length === 0}>Retry</button>
            </div>
          )}
        </div>

        <form className="culinary-chat-form" onSubmit={sendMessage}>
          <label className="visually-hidden" htmlFor="culinary-chat-input">Ask Culinary a cooking question</label>
          <textarea
            id="culinary-chat-input"
            ref={inputRef}
            value={draft}
            maxLength="2000"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about ingredients, techniques, or recipes…"
            rows="2"
            disabled={pending}
          />
          <button type="submit" className="primary-button" disabled={pending || !draft.trim()}>
            Send
          </button>
        </form>
        <p className="culinary-chat-note">AI guidance can be imperfect. Check allergies, doneness, and food safety.</p>
      </div>
    </aside>
  );
}
