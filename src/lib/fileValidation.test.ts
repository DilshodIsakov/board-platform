import { describe, it, expect } from "vitest";
import { assertFileAllowed, FILE_LIMITS } from "./fileValidation";

function makeFile(name: string, sizeBytes: number, type = "application/octet-stream"): File {
  const file = new File(["x"], name, { type });
  // File.size нельзя задать через конструктор без реального содержимого —
  // подменяем геттер, чтобы не аллоцировать десятки мегабайт в тесте.
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("assertFileAllowed", () => {
  it("пропускает обычный документ в пределах лимита", () => {
    const pdf = makeFile("report.pdf", 1024 * 1024, "application/pdf");
    expect(() => assertFileAllowed(pdf, "document")).not.toThrow();
  });

  it("блокирует исполняемые файлы независимо от размера", () => {
    for (const name of ["virus.exe", "script.bat", "macro.js", "UPPER.EXE"]) {
      expect(() => assertFileAllowed(makeFile(name, 10), "document")).toThrow();
    }
  });

  it("блокирует файл больше лимита контекста", () => {
    const big = makeFile("big.pdf", FILE_LIMITS.chat + 1, "application/pdf");
    expect(() => assertFileAllowed(big, "chat")).toThrow();
    // тот же размер проходит в контексте document (лимит выше)
    expect(() => assertFileAllowed(big, "document")).not.toThrow();
  });

  it("файл ровно на границе лимита проходит", () => {
    const edge = makeFile("edge.docx", FILE_LIMITS.task);
    expect(() => assertFileAllowed(edge, "task")).not.toThrow();
  });
});
