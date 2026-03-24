export type BackgroundMessage =
  | {
      type: "NEXUSMIND_ASK";
      payload: {
        question: string;
        pageText: string;
      };
    }
  | {
      type: "NEXUSMIND_SAVE_SETTINGS";
      payload: {
        provider: "openai" | "claude" | "gemini";
        model: string;
        apiKey: string;
        privacyMode: "strict" | "balanced";
        dailyLimit: number;
        monthlyLimit: number;
      };
    }
  | {
      type: "NEXUSMIND_GET_SETTINGS";
    };

export type BackgroundResponse =
  | {
      ok: true;
      data: unknown;
    }
  | {
      ok: false;
      error: string;
    };
