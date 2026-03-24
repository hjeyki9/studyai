import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    // CẢNH BÁO: API Key được nhúng trực tiếp theo yêu cầu của người dùng. 
    // Không nên công khai mã nguồn này để tránh bị lộ Key.
    const apiKey = "AIzaSyBTs0YEPwGBsZXyKr1s_HELK_DmzQtwgWg";
    
    if (!apiKey || apiKey === "undefined") {
      throw new Error("Thiếu GEMINI_API_KEY. Vui lòng thiết lập API Key để sử dụng tính năng AI.");
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
  const ai = getAI();
  let count = customCount || 10;
  let structurePrompt = "";
  const effectiveTopic = topic || `Kiến thức tổng hợp môn ${subject} lớp ${grade}${examPeriod ? ` (${examPeriod})` : ""}`;

  if (type === "Kiểm tra kiến thức") {
    if (!customCount) count = 25;
    structurePrompt = `Tạo bộ đề trắc nghiệm chọn đáp án (multiple-choice) kiểm tra kiến thức tổng quát cho chủ đề "${effectiveTopic}" theo chương trình giáo dục phổ thông Việt Nam.`;
  } else if (type === "Đề thi") {
    if (!customCount) count = 20; 
    structurePrompt = `Tạo bộ đề thi ${examPeriod} môn ${subject} lớp ${grade} chuẩn theo cấu trúc của Bộ Giáo dục và Đào tạo Việt Nam. 
    Chủ đề tập trung: "${effectiveTopic}".
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
    - Chủ đề/Nội dung: "${effectiveTopic}"
    - Loại hình: ${type} ${examPeriod ? `(${examPeriod})` : ""}
    - Đối tượng: Lớp ${grade || "tương ứng"}
    - Môn học: ${subject || "tương ứng"}
    - Độ khó: ${difficulty}
    - Số lượng câu hỏi: khoảng ${count}
    
    ${structurePrompt}
    
    YÊU CẦU QUAN TRỌNG VỀ ĐỊNH DẠNG: 
    1. Trả về kết quả dưới dạng JSON.
    2. Trình bày nội dung NGẮN GỌN, ĐẦY ĐỦ, TRÁNH DÀI DÒNG.
    3. BẮT BUỘC sử dụng LaTeX cho TẤT CẢ các công thức toán học, vật lý, hóa học. 
       - Công thức toán: sử dụng $...$ (ví dụ: $x^2 + y^2 = z^2$, $\\frac{a}{b}$).
       - Ký hiệu hóa học: sử dụng định dạng LaTeX chuẩn trong môi trường toán học $...$. 
       - Ví dụ hóa học: sử dụng $\\text{H}_2\\text{O}$ thay vì H2O, sử dụng $\\text{Fe} + \\text{O}_2 \\to \\text{Fe}_2\\text{O}_3$. 
       - KHÔNG sử dụng lệnh \\ce{...} vì hệ thống không hỗ trợ. Hãy dùng \\text{...} cho các ký hiệu nguyên tố và số chỉ số dưới.
       - Đảm bảo các chỉ số dưới được viết bằng _{...} (ví dụ: $\\text{CO}_2$ là $\\text{CO}_2$).
       - KHÔNG sử dụng ký tự thường cho các biểu thức khoa học.
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
    LƯU Ý: Trả lời NGẮN GỌN, SÚC TÍCH, ĐI THẲNG VÀO VẤN ĐỀ, không dài dòng.
    BẮT BUỘC sử dụng LaTeX cho công thức toán học.`,
  });

  return response.text;
};

export const getExplanationStream = async (concept: string, imageBase64?: string) => {
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

  const response = await ai.models.generateContentStream({
    model: models.text,
    contents: { parts },
    config: {
      systemInstruction: `Bạn là một trợ lý học tập chuyên nghiệp và thông minh. Hãy tự động nhận diện môn học và nội dung từ câu hỏi hoặc hình ảnh của người dùng. Hãy giải thích các kiến thức một cách NGẮN GỌN, ĐẦY ĐỦ, DỄ HIỂU, tránh dài dòng nhiều chữ. ĐỐI VỚI CÁC CÔNG THỨC TOÁN HỌC, VẬT LÝ, HÓA HỌC, BẮT BUỘC SỬ DỤNG ĐỊNH DẠNG LaTeX (ví dụ: $E=mc^2$). Nếu có hình ảnh, hãy phân tích kỹ nội dung hình ảnh để đưa ra lời giải chính xác nhất.`
    }
  });

  return response;
};

export const getQuizFeedback = async (quiz: Quiz, userAnswers: any[]) => {
  const ai = getAI();
  const performanceData = quiz.questions.map((q, i) => ({
    question: q.question,
    isCorrect: String(q.correctAnswer) === String(userAnswers[i]),
  }));

  const response = await ai.models.generateContent({
    model: models.text,
    contents: `Dựa trên kết quả làm bài của học sinh (Danh sách câu hỏi và trạng thái Đúng/Sai):
    ${JSON.stringify(performanceData)}
    
    Hãy đưa ra nhận xét chi tiết về:
    1. Điểm mạnh của học sinh.
    2. Những lỗ hổng kiến thức cần bổ sung.
    3. Lời khuyên cụ thể: cần ôn lại những chương nào, kiến thức nào.
    
    Yêu cầu: Trình bày bằng tiếng Việt, ngắn gọn, súc tích, sử dụng Markdown.`,
  });

  return response.text;
};
