import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, get } from 'firebase/database';

// بيانات الاتصال بـ Firebase (تستبدل ببيانات مشروعك الخاص لاحقاً)
const firebaseConfig = {
  apiKey: "AIzaSyAsYourKeyHere",
  authDomain: "siyaq-routine.firebaseapp.com",
  databaseURL: "https://siyaq-routine-default-rtdb.firebaseio.com",
  projectId: "siyaq-routine",
  storageBucket: "siyaq-routine.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const TEAM_COLORS = ['#5B7C99', '#8A6FAE', '#6F9C76', '#C08552', '#A3729C', '#5FA3A3', '#B0A062', '#9C6F6F'];
const CATEGORIES = ['عادات يومية', 'طبخ', 'سيارات', 'سفر', 'تقنية وتسوق'];

// مصفوفة الأسئلة (تم تعديلها وتوسيع بعضها لتدعم أعداد أجوبة مختلفة بين 5 و 12 جواب لتجربة المرونة)
const QUESTIONS = [
  { 
    category: 'عادات يومية', 
    text: 'أول شيء يفعله أغلب الناس بعد الاستيقاظ من النوم', 
    answers: [
      { text: 'النظر في الجوال', points: 35 }, { text: 'شرب الماء', points: 20 }, 
      { text: 'الذهاب للحمام', points: 15 }, { text: 'تمديد الجسم والتمطي', points: 10 }, 
      { text: 'النوم 5 دقائق إضافية', points: 8 }, { text: 'غسل الوجه', points: 7 },
      { text: 'ترتيب السرير', points: 5 }
    ] 
  },
  { 
    category: 'تقنية وتسوق', 
    text: 'أشياء يشتريها الناس عادةً عبر الإنترنت بسبب العروض', 
    answers: [
      { text: 'ملابس وأحذية', points: 25 }, { text: 'شواحن وكابلات جوال', points: 18 }, 
      { text: 'سماعات لاسلكية', points: 15 }, { text: 'عطور ومستحضرات', points: 12 }, 
      { text: 'ساعات ذكية', points: 10 }, { text: 'ألعاب فيديو', points: 8 },
      { text: 'إكسسوارات سيارات', points: 5 }, { text: 'أكواب قهوة', points: 4 },
      { text: 'حافظات هواتف (كفرات)', points: 3 }
    ] 
  },
  { 
    category: 'طبخ', 
    text: 'مكونات أساسية لا تخلو منها وجبة كبسة الدجاج السعودية', 
    answers: [
      { text: 'الأرز', points: 25 }, { text: 'الدجاج', points: 20 }, { text: 'البصل', points: 15 }, 
      { text: 'الطماطم / الصلصة', points: 12 }, { text: 'البهارات المشكلة', points: 10 }, { text: 'الزيت أو السمن', points: 6 },
      { text: 'الثوم', points: 5 }, { text: 'الملح', points: 4 }, { text: 'الهيل والمسمار', points: 2 },
      { text: 'اللومي الأسود', points: 1 }
    ] // 10 أجوبة
  },
  { 
    category: 'سيارات', 
    text: 'شيء يحرص السائق على التحقق منه قبل السفر بالسيارة لمسافة طويلة', 
    answers: [
      { text: 'زيت المحرك', points: 30 }, { text: 'ضغط الإطارات وحالتها', points: 25 }, 
      { text: 'مستوى ماء الرديتر', points: 20 }, { text: 'الفرامل (الفحمات)', points: 15 }, 
      { text: 'خزان الوقود (البنزين)', points: 10 }
    ] // 5 أجوبة (الحد الأدنى)
  }
];

function defaultState(roomCode) {
  return {
    roomCode: roomCode,
    phase: 'lobby', 
    round: 1,
    maxRounds: 5,
    teams: TEAM_COLORS.map((color, i) => ({ id: i, name: `فريق ${i + 1}`, color, score: 0 })),
    players: [],
    currentQuestion: null,
    usedQuestions: [],
    buzzedTeamId: null,
    buzzedPlayerId: null,
    buzzedAt: 0,
    errors: 0,
    errorFlashAt: 0,
    timer: { running: false, startedAt: null, duration: 30 },
    updatedAt: Date.now()
  };
}

function pickQuestion(category, used) {
  const pool = QUESTIONS
    .map((q, i) => ({ ...q, idx: i }))
    .filter(q => (!category || q.category === category) && !used.includes(q.idx));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function activeTeams(game) {
  if (!game || !game.players) return [];
  return game.teams.filter(t => game.players.some(p => p.teamId === t.id));
}

function timerRemaining(timer) {
  if (!timer || !timer.running || !timer.startedAt) return timer ? timer.duration : 30;
  const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000);
  return Math.max(0, (timer.duration || 30) - elapsed);
}

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function App() {
  const [roomCode, setRoomCode] = useState('');
  const [role, setRole] = useState(null); // host | player
  const [game, setGame] = useState(null);
  const [myPlayer, setMyPlayer] = useState(null);
  const [tick, setTick] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  
  const gameRef = useRef(null);
  gameRef.current = game;

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 250);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!roomCode) return;
    const roomRef = ref(db, `rooms/${roomCode}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setGame(data);
    });
    return () => unsubscribe();
  }, [roomCode]);

  async function pushState(updater) {
    if (!roomCode) return;
    const base = gameRef.current || defaultState(roomCode);
    const next = typeof updater === 'function' ? updater(JSON.parse(JSON.stringify(base))) : updater;
    next.updatedAt = Date.now();
    setGame(next);
    await set(ref(db, `rooms/${roomCode}`), next);
    return next;
  }

  async function handleCreateRoom() {
    const newCode = generateRoomCode();
    const initialState = defaultState(newCode);
    await set(ref(db, `rooms/${newCode}`), initialState);
    setRoomCode(newCode);
    setRole('host');
  }

  async function handleJoinRoom(enteredCode) {
    const cleanCode = enteredCode.trim().toUpperCase();
    if (!cleanCode) return;
    const roomCheck = await get(ref(db, `rooms/${cleanCode}`));
    if (roomCheck.exists()) {
      setRoomCode(cleanCode);
      setRole('player');
      setErrorMsg('');
    } else {
      setErrorMsg('رمز الغرفة غير صحيح أو غير موجود!');
    }
  }

  if (!role) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 text-center">
          <div className="font-display text-5xl font-black mb-3 text-[#d9b466]">سياق الروتين</div>
          <div className="text-sm mb-8 text-[#94a3b8]">اللوحة التفاعلية المدمجة للأجهزة الذكية</div>
          
          <div className="w-full max-w-md bg-[#121824] p-6 rounded-2xl border border-[#1e293b] flex flex-col gap-4">
            <button onClick={handleCreateRoom} className="w-full bg-[#1e293b] text-white font-display font-bold py-3.5 rounded-xl hover:bg-[#2b3a52] transition">
              إنشاء غرفة جديدة (لوحة المقدم)
            </button>
            
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-[#1e293b]"></div>
              <span className="flex-shrink mx-4 text-[#475569] text-xs font-bold font-display">أو دخول اللاعبين</span>
              <div className="flex-grow border-t border-[#1e293b]"></div>
            </div>

            <div className="text-right">
              <input 
                type="text" 
                placeholder="أدخل رمز الغرفة (مثال: RHQW)" 
                id="roomCodeInput"
                className="w-full rounded-xl px-4 py-3 mb-3 text-center font-display uppercase font-bold text-lg bg-[#0c121c] border border-[#1e293b] text-white focus:outline-none focus:border-[#d9b466]"
              />
              <button 
                onClick={() => {
                  const el = document.getElementById('roomCodeInput');
                  if (el) handleJoinRoom(el.value);
                }} 
                className="w-full rounded-xl py-3 font-display font-bold text-center transition-all bg-[#d9b466] text-[#0c121c]">
                انضمام للعبة واظهار اللوحة
              </button>
              {errorMsg && <div className="text-red-400 text-xs mt-2 text-center font-bold font-display">{errorMsg}</div>}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (role === 'host') return <Shell><HostView game={game} pushState={pushState} onChangeRole={() => setRole(null)} /></Shell>;
  
  return (
    <Shell>
      <PlayerComponent 
        game={game} 
        pushState={pushState} 
        freshState={async () => { const r = await get(ref(db, `rooms/${roomCode}`)); return r.val(); }} 
        myPlayer={myPlayer} 
        setMyPlayer={setMyPlayer} 
        tick={tick} 
        onChangeRole={() => setRole(null)} 
      />
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div dir="rtl" className="min-h-screen w-full font-display" style={{ background: '#0c121c', color: '#e8edf4' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        .font-display { font-family: 'Cairo', sans-serif; }
        .tabular { font-variant-numeric: tabular-nums; }
        @keyframes pop { from { opacity:0; transform: scale(0.95); } to { opacity:1; transform: scale(1); } }
        @keyframes shake { 0%, 100%{transform: translateX(0);} 20%, 60%{transform: translateX(-5px);} 40%, 80%{transform: translateX(5px);} }
        .animate-pop { animation: pop 0.25s ease-out; }
        .animate-shake { animation: shake 0.35s ease-in-out; }
      `}</style>
      {children}
    </div>
  );
}

/* ============================================================
   واجهة اللاعب المدمجة (تحتوي على لوحة الأجوبة وزر الكبس معاً)
   ============================================================ */
function PlayerComponent({ game, pushState, freshState, myPlayer, setMyPlayer, tick, onChangeRole }) {
  const [name, setName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!game) return <div className="p-6 text-center font-display text-sm">جاري ربط جهازك بالقاعدة...</div>;

  const playerExists = myPlayer && game.players && game.players.some(p => p.id === myPlayer.id);

  // مرحلة التسجيل واختيار الفريق في البداية
  if (!myPlayer || !playerExists) {
    async function handleJoin() {
      if (!name.trim() || selectedTeam === null) return;
      setBusy(true);
      const fresh = await freshState();
      const id = 'p_' + Math.random().toString(36).slice(2, 9);
      if (!fresh.players) fresh.players = [];
      fresh.players.push({ id, name: name.trim(), teamId: selectedTeam, joinedAt: Date.now() });
      await pushState(fresh);
      setMyPlayer({ id, name: name.trim(), teamId: selectedTeam });
      setBusy(false);
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-8 animate-pop">
        <div className="font-display text-3xl font-black mb-1 text-center text-[#d9b466]">غرفة اللعب: {game.roomCode}</div>
        <div className="text-xs mb-6 text-[#94a3b8]">أدخل بياناتك للانضمام إلى اللوحة المشتركة</div>
        
        <input 
          value={name} 
          onChange={e => setName(e.target.value)} 
          placeholder="اكتب اسمك هنا..." 
          className="w-full max-w-sm rounded-xl px-4 py-3 mb-5 text-center bg-[#121824] border border-[#1e293b] text-white focus:outline-none focus:border-[#d9b466]"
        />
        
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm mb-6">
          {game.teams.map(team => {
            const count = game.players ? game.players.filter(p => p.teamId === team.id).length : 0;
            const selected = selectedTeam === team.id;
            return (
              <button key={team.id} onClick={() => setSelectedTeam(team.id)}
                      className="rounded-xl p-3 text-center transition-all"
                      style={{ background: selected ? team.color + '22' : '#121824', border: `2px solid ${selected ? team.color : '#1e293b'}` }}>
                <div className="font-bold text-sm" style={{ color: team.color }}>{team.name}</div>
                <div className="text-xs mt-0.5 text-[#64748b]">{count} لاعبين</div>
              </button>
            );
          })}
        </div>

        <button onClick={handleJoin} disabled={!name.trim() || selectedTeam === null || busy}
                className="w-full max-w-sm rounded-xl py-3.5 font-bold bg-[#d9b466] text-[#0c121c] disabled:opacity-40 transition-all">
          فتح لوحة الإجابات 🎮
        </button>
      </div>
    );
  }

  const myTeam = game.teams.find(t => t.id === myPlayer.teamId);

  async function handleBuzz() {
    const fresh = await freshState();
    if (fresh.phase === 'playing' && fresh.currentQuestion && fresh.timer.running && !fresh.buzzedTeamId) {
      fresh.buzzedTeamId = myPlayer.teamId;
      fresh.buzzedPlayerId = myPlayer.id;
      fresh.buzzedAt = Date.now();
      await pushState(fresh);
      setMsg('');
    } else if (fresh.buzzedTeamId) {
      setMsg('❌ هاردلك! فريق آخر سبَقك في الكبس!');
      setTimeout(() => setMsg(''), 2000);
    }
  }

  // إذا كانت اللعبة لا تزال في الانتظار (Lobby)
  if (game.phase === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 animate-pop">
        <div className="text-xs bg-[#1e293b] text-[#d9b466] px-4 py-1 rounded-full mb-3 font-bold">الروم: {game.roomCode}</div>
        <div className="font-black text-2xl mb-1">تم الدخول بنجاح!</div>
        <div className="mb-6"><span className="px-3 py-0.5 rounded-md text-xs font-bold" style={{backgroundColor: myTeam.color+'22', color: myTeam.color}}>{myTeam.name}</span></div>
        <div className="text-sm text-[#94a3b8] animate-pulse">انتظر المقدم يطلق الجولة الأولى لتظهر لك لوحة الأجوبة الحية...</div>
      </div>
    );
  }

  // إذا انتهت اللعبة بالكامل
  if (game.phase === 'gameover') {
    return <GameOverScreen game={game} onChangeRole={onChangeRole} big={false} />;
  }

  const canBuzz = !!game.currentQuestion && game.timer.running && !game.buzzedTeamId;
  const isBuzzedOverlay = game.buzzedTeamId && (Date.now() - (game.buzzedAt || 0) < 1800);
  const isErrorFlash = game.errorFlashAt && (Date.now() - game.errorFlashAt < 1000);

  return (
    <div className="min-h-screen flex flex-col justify-between px-4 py-4 max-w-xl mx-auto animate-pop relative">
      
      {/* ومضات التنبيه السريعة اللحظية داخل جهاز اللاعب */}
      {isBuzzedOverlay && (
        <div className="absolute inset-0 z-50 rounded-2xl flex items-center justify-center bg-[#0c121c]/90 text-center p-4">
          <div>
            <div className="text-4xl font-black" style={{ color: game.teams.find(t => t.id === game.buzzedTeamId)?.color }}>
              {game.teams.find(t => t.id === game.buzzedTeamId)?.name}
            </div>
            <div className="text-sm text-[#94a3b8] mt-2">كبس أولاً! ولديه أفضلية الإجابة الآن</div>
          </div>
        </div>
      )}

      {isErrorFlash && (
        <div className="absolute inset-0 z-50 rounded-2xl flex items-center justify-center bg-red-950/40 animate-shake pointer-events-none">
          <span className="text-7xl">❌</span>
        </div>
      )}

      {/* الهيدر العلوي لمعلومات الجولة والنقاط */}
      <div className="flex justify-between items-center bg-[#121824] p-3 rounded-xl border border-[#1e293b]">
        <div>
          <div className="text-xs text-[#64748b] font-bold">فريقك الحالي:</div>
          <div className="text-sm font-bold" style={{ color: myTeam.color }}>{myTeam.name}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-[#64748b] font-bold">الجولة</div>
          <div className="text-sm font-black text-[#d9b466] tabular">{game.round} / {game.maxRounds}</div>
        </div>
        <div className="text-left">
          <div className="text-xs text-[#64748b] font-bold">أخطاء الجولة</div>
          <div className="text-xs text-red-500 font-bold tracking-wider">{'❌'.repeat(game.errors || 0) || 'لا يوجد'}</div>
        </div>
      </div>

      {/* لوحة عرض نقاط الفرق الحالية ليبقى متحمساً */}
      <div className="flex gap-2 justify-center my-2 flex-wrap">
        {activeTeams(game).map(t => (
          <div key={t.id} className="bg-[#121824]/60 border border-[#1e293b] px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }}></span>
            <span className="text-white font-medium">{t.name}:</span>
            <span className="font-bold text-[#d9b466] tabular">{t.score}</span>
          </div>
        ))}
      </div>

      {/* لوحة الأجوبة المركزية التفاعلية المشتركة */}
      <div className="flex-1 flex flex-col justify-center my-3 bg-[#121824] rounded-2xl p-4 border border-[#1e293b] gap-3">
        {!game.currentQuestion ? (
          <div className="text-center text-[#64748b] text-sm py-12">
            <div className="animate-pulse">في انتظار اختيار السؤال من قبل المقدم...</div>
          </div>
        ) : (
          <>
            <div className="text-center mb-1">
              <span className="text-[10px] font-bold px-2.5 py-0.5 bg-[#1e293b] rounded-full text-[#d9b466] mb-1.5 inline-block">
                {game.currentQuestion.category}
              </span>
              <h2 className="text-base sm:text-lg font-black text-white leading-relaxed">{game.currentQuestion.text}</h2>
            </div>

            {/* شبكة الأجوبة المرنة: تتكيف فوراً مع عدد الأجوبة من 5 لـ 12 */}
            <div className="grid grid-cols-1 gap-1.5 max-h-[280px] overflow-y-auto pr-1">
              {game.currentQuestion.answers.map((ans, idx) => (
                <div 
                  key={idx} 
                  className="flex justify-between items-center px-4 py-2 rounded-xl border text-sm transition-all duration-300"
                  style={{ 
                    background: ans.revealed ? '#1e293b' : '#0c121c', 
                    borderColor: ans.revealed ? '#d9b46644' : '#1e293b' 
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold font-display px-2 py-0.5 rounded bg-[#1e293b] text-[#64748b] tabular">
                      {idx + 1}
                    </span>
                    <span className="font-bold" style={{ color: ans.revealed ? '#e8edf4' : '#334155' }}>
                      {ans.revealed ? ans.text : '••••••••••••••••'}
                    </span>
                  </div>
                  <span className="font-black tabular" style={{ color: ans.revealed ? '#d9b466' : '#334155' }}>
                    {ans.revealed ? ans.points : '?'}
                  </span>
                </div>
              ))}
            </div>
            
            {/* مؤقت الجولة التنازلي الحركي واللحظي */}
            <div className="flex items-center justify-center gap-4 mt-1 border-t border-[#1e293b] pt-2 text-xs">
              <div className="font-bold text-[#64748b]">الوقت المتبقي:</div>
              <div className="font-black tabular text-base px-3 py-0.5 rounded-lg bg-[#0c121c]" 
                   style={{ color: timerRemaining(game.timer) < 6 ? '#ef4444' : '#d9b466' }}>
                {timerRemaining(game.timer)} ثانية
              </div>
            </div>
          </>
        )}
      </div>

      {/* زر الكبس التفاعلي السفلي (متاح دائماً أسفل اللوحة) */}
      <div className="w-full text-center pt-2">
        <button 
          onClick={handleBuzz}
          disabled={!canBuzz}
          className="w-full py-4 rounded-xl font-black font-display text-lg tracking-wide transition-all shadow-md active:scale-[0.98] disabled:opacity-30"
          style={{ 
            background: canBuzz ? '#d9b466' : '#1e293b', 
            color: canBuzz ? '#0c121c' : '#475569',
            boxShadow: canBuzz ? '0 4px 20px rgba(217,180,102,0.25)' : 'none'
          }}
        >
          {canBuzz ? 'اكبس الآن! 🛎️' : 'الزر مقفل (انتظر إطلاق العداد)'}
        </button>
        {msg && <div className="text-xs font-bold text-yellow-400 mt-2 animate-bounce">{msg}</div>}
      </div>
    </div>
  );
}

/* ============================================================
   لوحة التحكم الخاصة بالمقدم (يبقى كما هو لإدارة وتسيير اللعبة للروم)
   ============================================================ */
function HostView({ game, pushState, onChangeRole }) {
  if (!game) return <div className="p-6 text-center font-display text-sm">جاري تهيئة لوحة التحكم...</div>;

  function selectCategory(cat) {
    pushState(s => {
      const q = pickQuestion(cat, s.usedQuestions || []);
      if (!q) return s;
      if (!s.usedQuestions) s.usedQuestions = [];
      s.usedQuestions.push(q.idx);
      s.currentQuestion = { category: q.category, text: q.text, answers: q.answers.map(a => ({...a, revealed: false})) };
      s.buzzedTeamId = null; s.buzzedPlayerId = null; s.errors = 0;
      s.timer = { running: false, startedAt: null, duration: 30 };
      return s;
    });
  }

  function startTimer() {
    pushState(s => { s.timer = { running: true, startedAt: Date.now(), duration: 30 }; return s; });
  }

  function resetBuzzer() {
    pushState(s => { s.buzzedTeamId = null; s.buzzedPlayerId = null; s.timer = { running: false, startedAt: null, duration: 30 }; return s; });
  }

  function revealAnswer(idx) {
    pushState(s => {
      if (!s.currentQuestion || s.currentQuestion.answers[idx].revealed) return s;
      s.currentQuestion.answers[idx].revealed = true;
      if (s.buzzedTeamId !== null) {
        const t = s.teams.find(team => team.id === s.buzzedTeamId);
        if (t) t.score += s.currentQuestion.answers[idx].points;
      }
      return s;
    });
  }

  function markError() {
    pushState(s => {
      s.errors = Math.min(3, (s.errors || 0) + 1);
      s.errorFlashAt = Date.now();
      return s;
    });
  }

  function nextQuestion() {
    pushState(s => {
      s.currentQuestion = null; s.buzzedTeamId = null; s.errors = 0;
      s.timer = { running: false, startedAt: null, duration: 30 };
      if (s.round >= s.maxRounds) { s.phase = 'gameover'; } else { s.round += 1; }
      return s;
    });
  }

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto font-display">
      <div className="flex justify-between items-center bg-[#121824] p-4 rounded-xl border border-[#1e293b] mb-4">
        <div>
          <h1 className="text-base font-black text-[#d9b466]">لوحة تحكم وتوجيه المقدم</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">وزّع هذا الرمز للاعبين: <strong className="text-white bg-[#0c121c] px-2 py-0.5 rounded text-sm ml-1 tabular font-bold">{game.roomCode}</strong></p>
        </div>
        <button onClick={onChangeRole} className="text-xs bg-red-950/40 text-red-300 px-3 py-1 rounded-lg border border-red-900/60">إنهاء</button>
      </div>

      {game.phase === 'lobby' ? (
        <div className="bg-[#121824] p-6 rounded-xl border border-[#1e293b] text-center">
          <p className="text-sm mb-4 text-[#94a3b8]">عدد اللاعبين المسجلين في الغرفة حالياً: <strong className="text-white tabular">{game.players ? game.players.length : 0}</strong></p>
          <button 
            onClick={() => pushState(s => { s.phase = 'playing'; return s; })}
            disabled={!game.players || game.players.length === 0}
            className="bg-[#d9b466] text-[#0c121c] px-8 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
          >
            إطلاق بدء اللعبة لجميع الأجهزة 🚀
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {!game.currentQuestion ? (
            <div className="bg-[#121824] p-5 rounded-xl border border-[#1e293b] text-center animate-pop">
              <h3 className="text-sm font-bold mb-3 text-white">اختر تصنيف سؤال الجولة {game.round}:</h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => selectCategory(cat)} className="bg-[#1e293b] text-xs text-[#e8edf4] px-3 py-2 rounded-lg hover:bg-slate-700">{cat}</button>
                ))}
                <button onClick={() => selectCategory(null)} className="bg-[#d9b466] text-[#0c121c] text-xs px-4 py-2 rounded-lg font-bold">سؤال عشوائي</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 animate-pop">
              <div className="bg-[#121824] p-4 rounded-xl border border-[#1e293b]">
                <div className="text-xs text-[#d9b466] font-bold mb-1">السؤال المفتوح للأجهزة الحين:</div>
                <p className="font-bold text-base mb-3 text-white">{game.currentQuestion.text}</p>
                <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
                  {game.currentQuestion.answers.map((ans, i) => (
                    <button key={i} onClick={() => revealAnswer(i)} disabled={ans.revealed} className="flex justify-between p-2 rounded bg-[#0c121c] text-right text-xs border border-[#1e293b] disabled:opacity-30">
                      <span>{i+1}. {ans.text}</span>
                      <strong className="text-[#d9b466] tabular">{ans.points} ن</strong>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="bg-[#121824] p-4 rounded-xl border border-[#1e293b]">
                <h3 className="text-xs font-bold mb-3 text-[#64748b]">لوحة تحكم إدارية سريعة:</h3>
                {game.buzzedTeamId !== null ? (
                  <div className="bg-yellow-950/30 text-yellow-300 p-2.5 rounded-lg border border-yellow-800/50 text-center text-xs font-bold mb-3">
                     🚨 ضغط أولاً: {game.teams.find(t => t.id === game.buzzedTeamId)?.name}
                  </div>
                ) : <div className="bg-[#0c121c] p-2.5 rounded-lg text-center text-xs text-[#475569] mb-3">لم يكبس أحد الزر بعد</div>}
                
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button onClick={startTimer} className="bg-green-700 hover:bg-green-600 text-white p-2 rounded-lg text-xs font-bold">تشغيل عداد الـ 30 ثانية ⏱️</button>
                  <button onClick={resetBuzzer} className="bg-purple-700 hover:bg-purple-600 text-white p-2 rounded-lg text-xs font-bold">فك قفل/إعادة تعيين الكبّاس 🔄</button>
                </div>
                <button onClick={markError} className="w-full bg-red-600/90 hover:bg-red-600 text-white p-2 rounded-lg text-xs font-bold mb-4">تسجيل خطأ ❌ ({game.errors || 0}/3)</button>
                <button onClick={nextQuestion} className="w-full bg-[#d9b466] text-[#0c121c] p-3 rounded-xl font-black text-sm">اعتماد الانتقال للجولة التالية 🏁</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GameOverScreen({ game, onChangeRole, big }) {
  const sorted = activeTeams(game).slice().sort((a,b) => b.score - a.score);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 animate-pop">
      <h1 className="text-3xl font-black mb-4 text-[#d9b466]">🏆 انتهى التحدي!</h1>
      <div className="bg-[#121824] p-5 rounded-2xl border border-[#1e293b] w-full max-w-sm mb-6">
        {sorted.map((t, i) => (
          <div key={t.id} className="flex justify-between py-2.5 border-b border-[#1e293b] last:border-0 font-display text-sm">
            <span>الترتيب {i+1}: <strong style={{color: t.color}}>{t.name}</strong></span>
            <span className="font-black text-[#d9b466] tabular">{t.score} نقطة</span>
          </div>
        ))}
      </div>
      <button onClick={onChangeRole} className="bg-[#d9b466] text-[#0c121c] px-6 py-2 rounded-xl text-xs font-bold">العودة للرئيسية</button>
    </div>
  );
}
