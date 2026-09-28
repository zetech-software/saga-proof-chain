import { describe, expect, it } from "vitest";
import { estimateBusinessWindow as e, reliableProcessStart as r } from "./portal";

describe("estimativa em dias úteis (seg–sex, America/Sao_Paulo)", () => {
  it("valores já validados", () => {
    expect(e("2026-09-28")).toEqual({ min: "07/10/2026", max: "02/11/2026" });
    expect(e("2026-09-25")).toEqual({ min: "06/10/2026", max: "30/10/2026" });
  });
  it("segunda-feira", () => expect(e("2026-10-05")).toEqual({ min: "14/10/2026", max: "09/11/2026" }));
  it("sexta-feira", () => expect(e("2026-10-09")).toEqual({ min: "20/10/2026", max: "13/11/2026" }));
  it("sábado e domingo equivalem à sexta anterior como ponto de partida", () => {
    expect(e("2026-10-10")).toEqual(e("2026-10-09"));
    expect(e("2026-10-11")).toEqual(e("2026-10-09"));
  });
  it("virada de mês", () => expect(e("2026-10-29")).toEqual({ min: "09/11/2026", max: "03/12/2026" }));
  it("virada de ano", () => expect(e("2026-12-28")).toEqual({ min: "06/01/2027", max: "01/02/2027" }));
  it("fevereiro", () => expect(e("2027-02-01")).toEqual({ min: "10/02/2027", max: "08/03/2027" }));
  it("envio às 23h30 de sexta em Brasília conta como sexta", () =>
    expect(e("2026-09-26T02:30:00Z")).toEqual(e("2026-09-25")));
  it("sem data → sem estimativa", () => {
    expect(e(null)).toBeNull();
    expect(e("")).toBeNull();
    expect(r({ process_started_at: null, submitted_at: "2026-09-28T13:00:00Z", sentByClient: false })).toBeNull();
  });
  it("data confirmada pelo admin é usada", () => {
    expect(r({ process_started_at: "2026-09-28", submitted_at: "2025-01-01T00:00:00Z", sentByClient: false })).toBe("2026-09-28");
    expect(r({ process_started_at: null, submitted_at: "2026-09-28T13:00:00Z", sentByClient: true })).toBe("2026-09-28T13:00:00Z");
  });
});
