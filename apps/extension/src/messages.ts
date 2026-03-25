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
    }
  | {
      type: "NEXUSMIND_INDEX_PAGE";
      payload: {
        url: string;
        title: string;
        pageText: string;
      };
    }
  | {
      type: "NEXUSMIND_GRAPH_SEARCH";
      payload: {
        query: string;
      };
    }
  | {
      type: "NEXUSMIND_GRAPH_STATS";
    }
  | {
      type: "NEXUSMIND_GRAPH_CLEAR";
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
