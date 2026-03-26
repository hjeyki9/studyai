import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "undefined") {
      throw new Error("Thiếu GEMINI_API_KEY. Vui lòng thiết lập API Key trong phần cài đặt (Environment Variables) để sử dụng tính năng AI.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

export const models = {
  text: "gemini-3-flash-preview",
  pro: "gemini-3.1-pro-preview",
};

export type QuestionType = 'multiple-choice' | 'true-false' | 'short-answer' | 'essay';

export interface QuizQuestion {
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer?: any;
  explanation: string;
}

export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}

export const generateQuiz = async (
  topic: string, 
  type: string = "Kiểm tra kiến thức", 
  difficulty: string = "Trung bình",
  grade?: string,
  subject?: string,
  examPeriod?: string,
  customCount?: number
): Promise<Quiz> => {
  const response = await fetch("/api/generate-quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, type, difficulty, grade, subject, examPeriod, customCount }),
  });
  
  if (!response.ok) {
    let errorMessage = "Lỗi khi tạo đề thi";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      // If not JSON, it might be an HTML error page
      const text = await response.text();
      if (text.includes("The page could not be found")) {
        errorMessage = "Server chưa sẵn sàng hoặc không tìm thấy API. Vui lòng đợi giây lát và thử lại.";
      } else {
        errorMessage = `Lỗi hệ thống (${response.status})`;
      }
    }
    throw new Error(errorMessage);
  }
  
  return response.json();
};

export const getQuestionHelp = async (question: string, helpType: 'hint' | 'method' | 'solution') => {
  const response = await fetch("/api/question-help", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, helpType }),
  });
  
  if (!response.ok) {
    let errorMessage = "Lỗi khi lấy trợ giúp";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      errorMessage = `Lỗi hệ thống (${response.status})`;
    }
    throw new Error(errorMessage);
  }
  
  const data = await response.json();
  return data.text;
};

export const getExplanationStream = async (concept: string, imageBase64?: string) => {
  const response = await fetch("/api/explanation-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept, imageBase64 }),
  });
  
  if (!response.ok) {
    throw new Error("Lỗi khi kết nối với AI");
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        yield { text: decoder.decode(value) };
      }
    }
  };
};

export const getQuizFeedback = async (quiz: Quiz, userAnswers: any[]) => {
  const response = await fetch("/api/quiz-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quiz, userAnswers }),
  });
  
  if (!response.ok) {
    let errorMessage = "Lỗi khi lấy nhận xét";
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      errorMessage = `Lỗi hệ thống (${response.status})`;
    }
    throw new Error(errorMessage);
  }
  
  const data = await response.json();
  return data.text;
};
