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
  examPeriod?: string
): Promise<Quiz> => {
  const ai = getAI();
  let count = 10;
  let structurePrompt = "";

  if (type === "Kiểm tra kiến thức") {
    count = 25;
    structurePrompt = `Tạo bộ đề trắc nghiệm chọn đáp án (multiple-choice) kiểm tra kiến thức tổng quát cho chủ đề "${topic}" theo chương trình giáo dục phổ thông Việt Nam.`;
  } else if (type === "Đề thi") {
    count = 20; 
    structurePrompt = `Tạo bộ đề thi ${examPeriod} môn ${subject} lớp ${grade} chuẩn theo cấu trúc của Bộ Giáo dục và Đào tạo Việt Nam. 
    Chủ đề tập trung: "${topic}".
    Đề thi phải bao gồm các phần sau:
    - Phần I: Câu hỏi trắc nghiệm nhiều lựa chọn (multiple-choice).
    - Phần II: Câu hỏi trắc nghiệm đúng sai (true-false).
    - Phần III: Câu hỏi trắc nghiệm trả lời ngắn (short-answer).
    - Phần IV: Câu hỏi tự luận (essay) - nếu phù hợp với cấu trúc đề thi chuẩn của môn học này.
    Hãy đảm bảo nội dung bám sát chương trình chuẩn của lớp ${grade} và phân bổ mức độ: Nhận biết (40%), Thông hiểu (30%), Vận dụng (20%), Vận dụng cao (10%).`;
  }

  const response = await ai.models.generateContent({
    model: models.text,
    contents: `Yêu cầu tạo đề thi:
    - Chủ đề/Nội dung: "${topic}"
    - Loại hình: ${type} ${examPeriod ? `(${examPeriod})` : ""}
    - Đối tượng: Lớp ${grade || "tương ứng"}
    - Môn học: ${subject || "tương ứng"}
    - Độ khó: ${difficulty}
    - Số lượng câu hỏi: khoảng ${count}
    
    ${structurePrompt}
    
    YÊU CẦU QUAN TRỌNG: 
    1. Trả về kết quả dưới dạng JSON.
    2. BẮT BUỘC sử dụng định dạng LaTeX cho TẤT CẢ các công thức toán học, vật lý, hóa học (ví dụ: $x^2$, $\\frac{a}{b}$, $\\lim_{x \\to 0}$, $H_2O$, $Fe + O_2 \\to Fe_2O_3$, $v = \\frac{s}{t}$). KHÔNG sử dụng ký tự thường cho công thức.
    3. Cấu trúc JSON cho mỗi câu hỏi:
       - type: "multiple-choice" | "true-false" | "short-answer" | "essay"
       - question: nội dung câu hỏi (sử dụng LaTeX nếu có công thức)
       - options: mảng các lựa chọn (chỉ dành cho multiple-choice và true-false, sử dụng LaTeX nếu có công thức)
       - correctAnswer: đáp án đúng (BẮT BUỘC: trả về index 0, 1, 2... dưới dạng chuỗi cho multiple-choice/true-false; trả về nội dung đáp án cho short-answer; trả về null cho essay)
       - explanation: lời giải chi tiết (sử dụng LaTeX nếu có công thức)`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ["multiple-choice", "true-false", "short-answer", "essay"] },
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                correctAnswer: { type: Type.STRING, nullable: true },
                explanation: { type: Type.STRING }
              },
              required: ["type", "question", "explanation"]
            }
          }
        },
        required: ["title", "questions"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const getQuestionHelp = async (question: string, helpType: 'hint' | 'method' | 'solution') => {
  const ai = getAI();
  const promptMap = {
    hint: "Hãy đưa ra một gợi ý nhỏ để học sinh có thể tự suy nghĩ tiếp, không giải trực tiếp.",
    method: "Hãy hướng dẫn phương pháp giải, các bước tư duy cần thiết cho câu hỏi này.",
    solution: "Hãy trình bày lời giải chi tiết và đầy đủ cho câu hỏi này."
  };

  const response = await ai.models.generateContent({
    model: models.text,
    contents: `Câu hỏi: "${question}"
    Yêu cầu trợ giúp: ${promptMap[helpType]}
    BẮT BUỘC sử dụng LaTeX cho công thức toán học.`,
  });

  return response.text;
};

export const getExplanationStream = async (concept: string, subject: string = "Chung", imageBase64?: string) => {
  const ai = getAI();
  const parts: any[] = [{ text: concept }];
  
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64.split(',')[1]
      }
    });
  }

  const subjectInstruction = subject !== "Chung" ? `Bạn đang hỗ trợ môn học: ${subject}. Hãy tập trung kiến thức vào môn này.` : "Bạn là một trợ lý học tập đa năng.";

  const response = await ai.models.generateContentStream({
    model: models.text,
    contents: { parts },
    config: {
      systemInstruction: `Bạn là một trợ lý học tập chuyên nghiệp. ${subjectInstruction} Hãy giải thích các khái niệm một cách chi tiết, dễ hiểu, sử dụng ví dụ minh họa. ĐỐI VỚI CÁC CÔNG THỨC TOÁN HỌC, BẮT BUỘC SỬ DỤNG ĐỊNH DẠNG LaTeX (ví dụ: $E=mc^2$). Nếu có hình ảnh, hãy phân tích nội dung hình ảnh để hỗ trợ việc giảng bài.`
    }
  });

  return response;
};
