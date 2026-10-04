// Monospace preformatted block, the equivalent of Streamlit's st.code.

export default function CodeBlock({
  text,
  placeholder = "(none)",
}: {
  text: string;
  placeholder?: string;
}) {
  const value = text.trim().length > 0 ? text : placeholder;
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100 dark:border-slate-700">
      {value}
    </pre>
  );
}
