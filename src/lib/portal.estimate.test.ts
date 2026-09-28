import { describe, expect, it } from "vitest";
import { estimateBusinessWindow as e, isBusinessDay, reliableProcessStart as r } from "./portal";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("feriados considerados (nacionais + estadual SP)", () => {
  it.each([
    "2026-01-01", // Ano Novo
    "2026-04-03", // Sexta-feira Santa 2026 (Páscoa 05/04)
    "2027-03-26", // Sexta-feira Santa 2027 (Páscoa 28/03)
    "2030-04-19", // Sexta-feira Santa 2030 (Páscoa 21/04)
    "2026-04-21", // Tiradentes
    "2026-05-01", // Dia do Trabalho
    "2026-07-09", // Revolução Constitucionalista (SP)
    "2026-09-07", // Independência
    "2026-10-12", // Nossa Senhora Aparecida
    "2026-11-02", // Finados
    "2026-11-20", // Consciência Negra
    "2026-12-25", // Natal
  ])("%s não é dia útil", (d) => expect(isBusinessDay(day(d))).toBe(false));

  it("Carnaval e Corpus Christi não são feriados pela regra adotada", () => {
    expect(isBusinessDay(day("2026-02-16"))).toBe(true);
    expect(isBusinessDay(day("2026-02-17"))).toBe(true);
    expect(isBusinessDay(day("2026-06-04"))).toBe(true);
  });
  it("dia comum é útil; fim de semana não", () => {
    expect(isBusinessDay(day("2026-09-28"))).toBe(true);
    expect(isBusinessDay(day("2026-10-10"))).toBe(false);
    expect(isBusinessDay(day("2026-10-11"))).toBe(false);
  });
});

describe("estimativa em dias úteis (America/Sao_Paulo)", () => {
  it("casos de referência (agora com feriados)", () => {
    expect(e("2026-09-28")).toEqual({ min: "07/10/2026", max: "04/11/2026" });
    expect(e("2026-09-25")).toEqual({ min: "06/10/2026", max: "03/11/2026" });
  });
  it("segunda-feira", () =>
    expect(e("2026-10-05")).toEqual({ min: "15/10/2026", max: "11/11/2026" }));
  it("sexta-feira", () =>
    expect(e("2026-10-09")).toEqual({ min: "21/10/2026", max: "17/11/2026" }));
  it("sábado e domingo partem como a sexta anterior", () => {
    expect(e("2026-10-10")).toEqual(e("2026-10-09"));
    expect(e("2026-10-11")).toEqual(e("2026-10-09"));
  });
  it("Ano Novo / Natal / virada de ano", () => {
    expect(e("2026-12-22")).toEqual({ min: "04/01/2027", max: "28/01/2027" });
    expect(e("2026-12-28")).toEqual({ min: "07/01/2027", max: "02/02/2027" });
  });
  it("Carnaval conta como dia útil", () =>
    expect(e("2026-02-13")).toEqual({ min: "24/02/2026", max: "20/03/2026" }));
  it("Sexta-feira Santa móvel", () =>
    expect(e("2027-03-22")).toEqual({ min: "01/04/2027", max: "28/04/2027" }));
  it("Tiradentes", () => expect(e("2026-04-15")).toEqual({ min: "27/04/2026", max: "22/05/2026" }));
  it("Dia do Trabalho", () =>
    expect(e("2026-04-28")).toEqual({ min: "08/05/2026", max: "03/06/2026" }));
  it("feriado estadual SP 09/07", () =>
    expect(e("2026-07-06")).toEqual({ min: "16/07/2026", max: "11/08/2026" }));
  it("Independência", () =>
    expect(e("2026-09-03")).toEqual({ min: "15/09/2026", max: "09/10/2026" }));
  it("Nossa Senhora Aparecida", () =>
    expect(e("2026-10-08")).toEqual({ min: "20/10/2026", max: "16/11/2026" }));
  it("Finados + Proclamação (domingo) + Consciência Negra — feriados próximos", () => {
    expect(e("2026-10-29")).toEqual({ min: "10/11/2026", max: "07/12/2026" });
    expect(e("2026-11-12")).toEqual({ min: "24/11/2026", max: "18/12/2026" });
  });
  it("feriado em sábado/domingo não desconta nada extra", () => {
    // 15/11/2026 é domingo; 01/05/2027 é sábado
    expect(e("2026-11-10")).toEqual({ min: "19/11/2026", max: "16/12/2026" });
    expect(e("2027-04-27")).toEqual({ min: "06/05/2027", max: "01/06/2027" });
  });
  it("fevereiro", () => expect(e("2027-02-01")).toEqual({ min: "10/02/2027", max: "08/03/2027" }));
  it("envio às 23h30 de sexta em Brasília conta como sexta", () =>
    expect(e("2026-09-26T02:30:00Z")).toEqual(e("2026-09-25")));
  it("sem data → sem estimativa", () => {
    expect(e(null)).toBeNull();
    expect(e("")).toBeNull();
    expect(
      r({ process_started_at: null, submitted_at: "2026-09-28T13:00:00Z", sentByClient: false }),
    ).toBeNull();
  });
  it("data confirmada pelo admin é usada", () => {
    expect(
      r({
        process_started_at: "2026-09-28",
        submitted_at: "2025-01-01T00:00:00Z",
        sentByClient: false,
      }),
    ).toBe("2026-09-28");
    expect(
      r({ process_started_at: null, submitted_at: "2026-09-28T13:00:00Z", sentByClient: true }),
    ).toBe("2026-09-28T13:00:00Z");
  });
});
