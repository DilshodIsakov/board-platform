import { describe, it, expect } from "vitest";
import { tallyBoardVotes, type Vote } from "./voting";

function vote(choice: Vote["choice"], voterId: string): Vote {
  return {
    id: `vote-${voterId}`,
    voting_id: "voting-1",
    org_id: "org-1",
    voter_id: voterId,
    choice,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("tallyBoardVotes", () => {
  it("пустой список голосов даёт нули", () => {
    expect(tallyBoardVotes([])).toEqual({
      forCount: 0,
      againstCount: 0,
      abstainCount: 0,
      total: 0,
    });
  });

  it("считает за / против / воздержался", () => {
    const votes = [
      vote("for", "a"),
      vote("for", "b"),
      vote("against", "c"),
      vote("abstain", "d"),
    ];
    expect(tallyBoardVotes(votes)).toEqual({
      forCount: 2,
      againstCount: 1,
      abstainCount: 1,
      total: 4,
    });
  });

  it("неизвестный выбор попадает в «воздержался», total сходится", () => {
    const votes = [vote("for", "a"), { ...vote("abstain", "b"), choice: "weird" as Vote["choice"] }];
    const tally = tallyBoardVotes(votes);
    expect(tally.total).toBe(2);
    expect(tally.forCount + tally.againstCount + tally.abstainCount).toBe(tally.total);
  });
});
