import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GraduationCap, 
  MessageSquare, 
  Search, 
  Plus, 
  ChevronRight,
  CheckCircle2,
  FileText,
  Send,
  Loader2,
  ArrowLeft,
  X,
  Download,
  Lightbulb,
  HelpCircle,
  BookOpen
} from 'lucide-react';
import { 
  generateQuiz, 
  getExplanationStream, 
  getQuestionHelp,
  Quiz, 
  QuizQuestion 
} from './services/geminiService';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { cn } from './utils';

type View = 'dashboard' | 'quiz' | 'tutor';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [loading, setLoading] = useState(false);

  // Quiz State
  const [quizTopic, setQuizTopic] = useState('');
  const [quizType, setQuizType] = useState('Kiểm tra kiến thức');
  const [quizDifficulty, setQuizDifficulty] = useState('Trung bình');
  const [quizGrade, setQuizGrade] = useState('12');
  const [quizSubject, setQuizSubject] = useState('Toán');
  const [quizExamPeriod, setQuizExamPeriod] = useState('Giữa kì 1');
  const [generatedQuiz, setGeneratedQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<any[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [activeHelp, setActiveHelp] = useState<{index: number, content: string, type: string} | null>(null);
  const [helpLoading, setHelpLoading] = useState<number | null>(null);

  // Tutor State
  const [tutorQuery, setTutorQuery] = useState('');
  const [tutorImage, setTutorImage] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState('Chung');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const chatContainerRef = React.useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
  };

  const scrollToBottom = () => {
    if (isAtBottom && chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const subjects = ['Chung', 'Toán', 'Văn', 'Anh', 'Lý', 'Hóa', 'Địa', 'Sinh', 'Sử'];

  const handleGenerateQuiz = async () => {
    if (!quizTopic) return;
    setLoading(true);
    try {
      const res = await generateQuiz(
        quizTopic, 
        quizType, 
        quizDifficulty,
        quizType === 'Đề thi' ? quizGrade : undefined,
        quizType === 'Đề thi' ? quizSubject : undefined,
        quizType === 'Đề thi' ? quizExamPeriod : undefined
      );
      setGeneratedQuiz(res);
      setUserAnswers(new Array(res.questions.length).fill(null));
      setQuizSubmitted(false);
      setActiveHelp(null);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGetHelp = async (index: number, helpType: 'hint' | 'method' | 'solution') => {
    if (!generatedQuiz) return;
    setHelpLoading(index);
    try {
      const content = await getQuestionHelp(generatedQuiz.questions[index].question, helpType);
      setActiveHelp({ index, content: content || '', type: helpType });
    } catch (error) {
      console.error(error);
    } finally {
      setHelpLoading(null);
    }
  };

  const downloadPDF = () => {
    if (!generatedQuiz) return;
    const doc = new jsPDF();
    
    // Helper to clean LaTeX for PDF
    const cleanText = (text: string) => {
      return text.replace(/\$/g, '').replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2').replace(/\\sqrt\{([^}]*)\}/g, '√$1');
    };

    let y = 20;
    doc.setFontSize(16);
    const title = cleanText(generatedQuiz.title);
    doc.text(title, 105, y, { align: 'center' });
    y += 15;
    
    doc.setFontSize(11);
    generatedQuiz.questions.forEach((q, i) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      
      const questionText = `${i + 1}. ${cleanText(q.question)}`;
      const splitQuestion = doc.splitTextToSize(questionText, 180);
      doc.text(splitQuestion, 10, y);
      y += splitQuestion.length * 7;

      if (q.options) {
        q.options.forEach((opt, j) => {
          if (y > 280) {
            doc.addPage();
            y = 20;
          }
          const optText = `   ${String.fromCharCode(65 + j)}. ${cleanText(opt)}`;
          const splitOpt = doc.splitTextToSize(optText, 170);
          doc.text(splitOpt, 15, y);
          y += splitOpt.length * 6;
        });
      }
      y += 5;
    });

    // Add Answer Key
    doc.addPage();
    y = 20;
    doc.setFontSize(14);
    doc.text("ĐÁP ÁN VÀ GIẢI THÍCH", 105, y, { align: 'center' });
    y += 15;
    doc.setFontSize(10);
    generatedQuiz.questions.forEach((q, i) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      const ansText = `${i + 1}. Đáp án: ${q.correctAnswer || 'Tự luận'}`;
      doc.text(ansText, 10, y);
      y += 6;
      const expText = `Giải thích: ${cleanText(q.explanation)}`;
      const splitExp = doc.splitTextToSize(expText, 180);
      doc.text(splitExp, 10, y);
      y += splitExp.length * 5 + 5;
    });

    doc.save(`${generatedQuiz.title.replace(/\s+/g, '_')}.pdf`);
  };

  const downloadDOC = async () => {
    if (!generatedQuiz) return;
    
    const cleanText = (text: string) => {
      return text.replace(/\$/g, '');
    };

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: generatedQuiz.title, bold: true, size: 32 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          ...generatedQuiz.questions.flatMap((q, i) => [
            new Paragraph({
              children: [new TextRun({ text: `${i + 1}. ${cleanText(q.question)}`, bold: true, size: 24 })],
              spacing: { before: 200, after: 100 },
            }),
            ...(q.options || []).map((opt, j) => new Paragraph({
              children: [new TextRun({ text: `${String.fromCharCode(65 + j)}. ${cleanText(opt)}`, size: 22 })],
              indent: { left: 720 },
              spacing: { after: 50 }
            }))
          ]),
          new Paragraph({
            children: [new TextRun({ text: "ĐÁP ÁN VÀ GIẢI THÍCH", bold: true, size: 28, break: 2 })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 }
          }),
          ...generatedQuiz.questions.flatMap((q, i) => [
            new Paragraph({
              children: [
                new TextRun({ text: `${i + 1}. Đáp án: ${q.correctAnswer || 'Tự luận'}`, bold: true, size: 22 }),
                new TextRun({ text: `\nGiải thích: ${cleanText(q.explanation)}`, size: 20, italics: true })
              ],
              spacing: { before: 100 }
            })
          ])
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${generatedQuiz.title.replace(/\s+/g, '_')}.docx`);
  };

  const handleTutorQuery = async () => {
    if (!tutorQuery && !tutorImage) return;
    const query = tutorQuery;
    const image = tutorImage;
    setTutorQuery('');
    setTutorImage(null);
    
    const userMsg = { role: 'user' as const, content: query || 'Phân tích hình ảnh này' };
    setChatHistory(prev => [...prev, userMsg]);
    
    setLoading(true);
    try {
      const stream = await getExplanationStream(
        query || 'Hãy phân tích hình ảnh này và giải thích các kiến thức liên quan.', 
        selectedSubject,
        image || undefined
      );
      
      let aiContent = '';
      // Add an empty AI message that we will update
      setChatHistory(prev => [...prev, { role: 'ai', content: '' }]);
      
      for await (const chunk of stream) {
        aiContent += chunk.text || '';
        setChatHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = { role: 'ai', content: aiContent };
          return newHistory;
        });
      }
    } catch (error) {
      console.error(error);
      setChatHistory(prev => [...prev, { role: 'ai', content: 'Xin lỗi, đã có lỗi xảy ra khi kết nối với AI.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTutorImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl text-slate-900 mb-2 font-display">Chào mừng bạn!</h1>
          <p className="text-slate-500">Hôm nay bạn muốn học gì?</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { 
            id: 'quiz', 
            title: 'Luyện tập & Kiểm tra', 
            desc: 'Tạo đề thi trắc nghiệm thông minh với nhiều cấp độ khó.', 
            icon: <FileText className="text-emerald-500" />,
            color: 'bg-emerald-50'
          },
          { 
            id: 'tutor', 
            title: 'Trợ lý học tập', 
            desc: 'Giải đáp thắc mắc và phân tích hình ảnh bài tập.', 
            icon: <MessageSquare className="text-purple-500" />,
            color: 'bg-purple-50'
          }
        ].map((item) => (
          <motion.button
            key={item.id}
            whileHover={{ y: -4 }}
            onClick={() => setCurrentView(item.id as View)}
            className="flex flex-col items-start p-8 rounded-3xl bg-white border border-slate-100 shadow-sm text-left transition-all hover:shadow-md group"
          >
            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", item.color)}>
              {React.cloneElement(item.icon as React.ReactElement<any>, { size: 28 })}
            </div>
            <h3 className="text-2xl mb-3">{item.title}</h3>
            <p className="text-slate-500 mb-6">{item.desc}</p>
            <div className="mt-auto flex items-center text-slate-400 text-sm font-medium group-hover:text-slate-900 transition-colors">
              Bắt đầu ngay <ChevronRight size={16} className="ml-1" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );

  const renderQuiz = () => (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-slate-600" />
          </button>
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Luyện tập & Kiểm tra</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Chế độ thi chuẩn</span>
            </div>
          </div>
        </div>
        
        {generatedQuiz && (
          <div className="flex items-center gap-2">
            <button onClick={downloadPDF} className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 text-sm font-bold">
              <Download size={16} /> PDF
            </button>
            <button onClick={downloadDOC} className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 text-sm font-bold">
              <Download size={16} /> DOCX
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-[#F8F9FB]">
        {!generatedQuiz ? (
          <div className="max-w-2xl mx-auto py-12 px-4">
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-8">
              <div className="text-center">
                <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3">
                  <FileText size={40} className="-rotate-3" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-2">Tạo đề thi chuẩn</h2>
                <p className="text-slate-500">Hệ thống AI sẽ tạo đề thi bám sát chương trình giáo dục Việt Nam.</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">Chủ đề hoặc Môn học</label>
                  <input 
                    type="text" 
                    placeholder="VD: Giải tích 12, Hóa học hữu cơ, Tiếng Anh tốt nghiệp..."
                    className="w-full px-6 py-4 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-slate-50"
                    value={quizTopic}
                    onChange={(e) => setQuizTopic(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">Loại đề thi</label>
                    <select 
                      className="w-full px-6 py-4 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-slate-50"
                      value={quizType}
                      onChange={(e) => setQuizType(e.target.value)}
                    >
                      <option>Kiểm tra kiến thức</option>
                      <option>Đề thi</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">Độ khó</label>
                    <select 
                      className="w-full px-6 py-4 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-slate-50"
                      value={quizDifficulty}
                      onChange={(e) => setQuizDifficulty(e.target.value)}
                    >
                      <option>Dễ</option>
                      <option>Trung bình</option>
                      <option>Khó</option>
                      <option>Chuyên gia</option>
                    </select>
                  </div>
                </div>

                {quizType === 'Đề thi' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2"
                  >
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">Môn học</label>
                      <select 
                        className="w-full px-6 py-4 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-slate-50"
                        value={quizSubject}
                        onChange={(e) => setQuizSubject(e.target.value)}
                      >
                        {subjects.filter(s => s !== 'Chung').map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">Lớp</label>
                      <select 
                        className="w-full px-6 py-4 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-slate-50"
                        value={quizGrade}
                        onChange={(e) => setQuizGrade(e.target.value)}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(g => (
                          <option key={g} value={g}>Lớp {g}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">Kỳ thi</label>
                      <select 
                        className="w-full px-6 py-4 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-slate-50"
                        value={quizExamPeriod}
                        onChange={(e) => setQuizExamPeriod(e.target.value)}
                      >
                        <option>Giữa kì 1</option>
                        <option>Cuối kì 1</option>
                        <option>Giữa kì 2</option>
                        <option>Cuối kì 2</option>
                        <option>Thi tốt nghiệp THPT</option>
                      </select>
                    </div>
                  </motion.div>
                )}

                <button 
                  onClick={handleGenerateQuiz}
                  disabled={loading || !quizTopic}
                  className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-100 text-lg"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Plus size={24} />}
                  Bắt đầu tạo đề
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto py-8 px-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-10 pb-6 border-b border-slate-100">
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900">{generatedQuiz.title}</h2>
                    <p className="text-slate-400 mt-1 font-medium">Thời gian làm bài: 90 phút (dự kiến)</p>
                  </div>
                  <div className="px-6 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-bold border border-emerald-100">
                    {quizSubmitted ? 'Đã hoàn thành' : 'Đang thực hiện'}
                  </div>
                </div>

                <div className="space-y-16">
                  {generatedQuiz.questions.map((q, i) => (
                    <div key={i} className="space-y-6">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex gap-5">
                          <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg">
                            {i + 1}
                          </span>
                          <div className="space-y-2">
                            <div className="text-xl font-medium text-slate-800 leading-relaxed">
                              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {q.question}
                              </Markdown>
                            </div>
                            <div className="flex gap-2">
                              <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full uppercase tracking-widest">
                                {q.type === 'multiple-choice' ? 'Trắc nghiệm' : q.type === 'true-false' ? 'Đúng/Sai' : q.type === 'short-answer' ? 'Trả lời ngắn' : 'Tự luận'}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleGetHelp(i, 'hint')}
                            className="p-2.5 text-amber-500 hover:bg-amber-50 rounded-xl transition-colors"
                            title="Gợi ý"
                          >
                            <Lightbulb size={20} />
                          </button>
                          <button 
                            onClick={() => handleGetHelp(i, 'method')}
                            className="p-2.5 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                            title="Cách giải"
                          >
                            <HelpCircle size={20} />
                          </button>
                          <button 
                            onClick={() => handleGetHelp(i, 'solution')}
                            className="p-2.5 text-purple-500 hover:bg-purple-50 rounded-xl transition-colors"
                            title="Giải chi tiết"
                          >
                            <BookOpen size={20} />
                          </button>
                        </div>
                      </div>

                      {/* AI Help Display */}
                      <AnimatePresence>
                        {activeHelp?.index === i && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="ml-14 overflow-hidden"
                          >
                            <div className="p-5 bg-amber-50 border border-amber-100 rounded-2xl text-[15px] relative">
                              <button 
                                onClick={() => setActiveHelp(null)}
                                className="absolute top-3 right-3 text-amber-400 hover:text-amber-600"
                              >
                                <X size={16} />
                              </button>
                              <p className="font-bold text-amber-800 mb-3 flex items-center gap-2">
                                {activeHelp.type === 'hint' && <Lightbulb size={16} />}
                                {activeHelp.type === 'method' && <HelpCircle size={16} />}
                                {activeHelp.type === 'solution' && <BookOpen size={16} />}
                                Hỗ trợ AI: {activeHelp.type === 'hint' ? 'Gợi ý' : activeHelp.type === 'method' ? 'Phương pháp' : 'Lời giải'}
                              </p>
                              <div className="markdown-body text-amber-900 leading-relaxed">
                                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                  {activeHelp.content}
                                </Markdown>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {helpLoading === i && (
                        <div className="ml-14 flex items-center gap-3 text-sm text-slate-400 font-medium">
                          <Loader2 size={16} className="animate-spin text-emerald-500" /> AI đang soạn lời giải...
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4 pl-14">
                        {q.type === 'multiple-choice' || q.type === 'true-false' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {q.options?.map((opt, j) => {
                              const isSelected = userAnswers[i] === j;
                              const isCorrect = Number(q.correctAnswer) === j;
                              const showResult = quizSubmitted;
                              
                              return (
                                <button
                                  key={j}
                                  disabled={quizSubmitted}
                                  onClick={() => {
                                    const newAnswers = [...userAnswers];
                                    newAnswers[i] = j;
                                    setUserAnswers(newAnswers);
                                  }}
                                  className={cn(
                                    "text-left p-5 rounded-2xl border-2 transition-all flex items-center justify-between group",
                                    !showResult && isSelected ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-white border-slate-100 hover:border-emerald-200",
                                    showResult && isCorrect && "bg-emerald-50 border-emerald-500 text-emerald-700",
                                    showResult && isSelected && !isCorrect && "bg-red-50 border-red-500 text-red-700"
                                  )}
                                >
                                  <div className="flex items-center gap-4">
                                    <span className={cn(
                                      "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors",
                                      isSelected ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-500"
                                    )}>
                                      {String.fromCharCode(65 + j)}
                                    </span>
                                    <div className="flex-1">
                                      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                        {opt}
                                      </Markdown>
                                    </div>
                                  </div>
                                  {showResult && isCorrect && <CheckCircle2 size={20} />}
                                </button>
                              );
                            })}
                          </div>
                        ) : q.type === 'short-answer' ? (
                          <div className="space-y-3">
                            <input 
                              type="text"
                              disabled={quizSubmitted}
                              placeholder="Nhập câu trả lời ngắn của bạn..."
                              className="w-full p-5 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none transition-all bg-slate-50 focus:bg-white text-lg"
                              value={userAnswers[i] || ''}
                              onChange={(e) => {
                                const newAnswers = [...userAnswers];
                                newAnswers[i] = e.target.value;
                                setUserAnswers(newAnswers);
                              }}
                            />
                            {quizSubmitted && (
                              <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl text-sm font-bold border border-emerald-100">
                                Đáp án đúng: {q.correctAnswer}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <textarea 
                              disabled={quizSubmitted}
                              placeholder="Trình bày bài làm tự luận chi tiết tại đây..."
                              className="w-full p-6 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none transition-all bg-slate-50 focus:bg-white min-h-[200px] text-lg leading-relaxed"
                              value={userAnswers[i] || ''}
                              onChange={(e) => {
                                const newAnswers = [...userAnswers];
                                newAnswers[i] = e.target.value;
                                setUserAnswers(newAnswers);
                              }}
                            />
                          </div>
                        )}
                      </div>
                      {quizSubmitted && (
                        <div className="ml-14 p-6 bg-slate-50 rounded-2xl border border-slate-100 text-[15px] text-slate-600 leading-relaxed">
                          <p className="font-bold mb-3 text-slate-900 flex items-center gap-2">
                            <BookOpen size={18} className="text-emerald-500" /> Hướng dẫn giải chi tiết:
                          </p>
                          <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {q.explanation}
                          </Markdown>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-16 pt-10 border-t border-slate-100">
                  {!quizSubmitted ? (
                    <button 
                      onClick={() => setQuizSubmitted(true)}
                      className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 text-xl"
                    >
                      Hoàn thành & Nộp bài
                    </button>
                  ) : (
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setGeneratedQuiz(null)}
                        className="flex-1 py-5 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black transition-all text-xl"
                      >
                        Làm đề mới
                      </button>
                      <button 
                        onClick={() => setCurrentView('dashboard')}
                        className="flex-1 py-5 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-all text-xl"
                      >
                        Về trang chủ
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );

  const renderTutor = () => (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      {/* Gauth-style Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-slate-600" />
          </button>
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Trợ lý học tập</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Trực tuyến</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {subjects.slice(0, 4).map(sub => (
              <button
                key={sub}
                onClick={() => setSelectedSubject(sub)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  selectedSubject === sub 
                    ? "bg-white text-purple-600 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {sub}
              </button>
            ))}
            <select 
              className="bg-transparent text-xs font-bold text-slate-500 px-2 outline-none"
              value={subjects.includes(selectedSubject) && subjects.indexOf(selectedSubject) > 3 ? selectedSubject : ""}
              onChange={(e) => e.target.value && setSelectedSubject(e.target.value)}
            >
              <option value="" disabled>Thêm...</option>
              {subjects.slice(4).map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#F8F9FB]"
      >
        {chatHistory.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-24 h-24 bg-purple-50 rounded-3xl flex items-center justify-center rotate-12">
              <MessageSquare size={48} className="text-purple-500 -rotate-12" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">EduAI có thể giúp gì?</h2>
              <p className="text-slate-500 max-w-[280px] mx-auto text-sm">
                Chụp ảnh bài tập hoặc nhập câu hỏi để nhận lời giải chi tiết ngay lập tức.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm px-4">
              {['Giải toán hình', 'Viết đoạn văn', 'Dịch tiếng Anh', 'Giải hóa học'].map((hint) => (
                <button 
                  key={hint}
                  onClick={() => setTutorQuery(hint)}
                  className="p-3 bg-white border border-slate-100 rounded-2xl text-xs font-medium text-slate-600 hover:border-purple-200 hover:text-purple-600 transition-all text-left"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatHistory.map((msg, i) => (
          <div key={i} className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[90%] md:max-w-[75%] p-4 rounded-2xl shadow-sm",
              msg.role === 'user' 
                ? "bg-purple-600 text-white rounded-tr-none" 
                : "bg-white text-slate-800 rounded-tl-none border border-slate-100"
            )}>
              <div className="markdown-body text-[15px] leading-relaxed">
                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {msg.content}
                </Markdown>
              </div>
            </div>
          </div>
        ))}

        {loading && chatHistory[chatHistory.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 p-4 rounded-2xl rounded-tl-none flex items-center gap-3 shadow-sm">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area - Gauth Style */}
      <div className="p-4 bg-white border-t border-slate-100 pb-8">
        <div className="max-w-4xl mx-auto">
          {tutorImage && (
            <div className="mb-3 relative inline-block">
              <img src={tutorImage} alt="Preview" className="h-20 w-20 object-cover rounded-xl border border-slate-200" />
              <button 
                onClick={() => setTutorImage(null)}
                className="absolute -top-2 -right-2 bg-slate-900 text-white rounded-full p-1 shadow-lg"
              >
                <X size={12} />
              </button>
            </div>
          )}
          
          <div className="relative flex items-center gap-2 bg-[#F3F4F6] rounded-3xl p-2 pl-4">
            <label className="p-2 text-slate-500 hover:text-purple-600 transition-colors cursor-pointer">
              <Plus size={24} />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            
            <textarea 
              placeholder="Hỏi EduAI bất cứ điều gì..."
              className="flex-1 bg-transparent py-2 px-2 focus:outline-none text-slate-800 resize-none max-h-32 min-h-[40px]"
              rows={1}
              value={tutorQuery}
              onChange={(e) => {
                setTutorQuery(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleTutorQuery();
                }
              }}
            />
            
            <button 
              onClick={handleTutorQuery}
              disabled={loading || (!tutorQuery && !tutorImage)}
              className={cn(
                "p-2.5 rounded-full transition-all shadow-md",
                loading || (!tutorQuery && !tutorImage) 
                  ? "bg-slate-300 text-white" 
                  : "bg-purple-600 text-white hover:scale-105 active:scale-95"
              )}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div 
              className="flex items-center gap-2 cursor-pointer" 
              onClick={() => setCurrentView('dashboard')}
            >
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                <GraduationCap size={24} />
              </div>
              <span className="text-xl font-display font-bold text-slate-900">EduAI</span>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <button 
                onClick={() => setCurrentView('dashboard')}
                className={cn("text-sm font-semibold transition-colors", currentView === 'dashboard' ? "text-emerald-600" : "text-slate-500 hover:text-slate-900")}
              >
                Tổng quan
              </button>
              <button 
                onClick={() => setCurrentView('quiz')}
                className={cn("text-sm font-semibold transition-colors", currentView === 'quiz' ? "text-emerald-600" : "text-slate-500 hover:text-slate-900")}
              >
                Kiểm tra
              </button>
              <button 
                onClick={() => setCurrentView('tutor')}
                className={cn("text-sm font-semibold transition-colors", currentView === 'tutor' ? "text-emerald-600" : "text-slate-500 hover:text-slate-900")}
              >
                Trợ lý
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                <Search size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {currentView === 'dashboard' && renderDashboard()}
            {currentView === 'quiz' && renderQuiz()}
            {currentView === 'tutor' && renderTutor()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
