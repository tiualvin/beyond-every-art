/**
 * `Apps.summary` is a textarea, so an editor separates paragraphs with a blank
 * line the way they would anywhere else. Both routes render it, and rendering
 * it as one block turned four paragraphs into a wall on the detail page.
 */
export function Paragraphs({
  text,
  className,
}: {
  text: string
  className: string
}) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p className={className} key={`${index}-${paragraph.slice(0, 24)}`}>
          {paragraph}
        </p>
      ))}
    </>
  )
}
