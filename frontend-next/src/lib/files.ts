/** The server drops files whose extension is not lower case, so lower it. */
export function lowerExtension(file: File): File {
  const parts = file.name.split(".");
  if (parts.length < 2) return file;
  parts.push((parts.pop() ?? "").toLowerCase());
  return new File([file], parts.join("."), { type: file.type });
}
