import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Ellipsis, LayoutGrid, Network, PanelLeft, Save, UserRound} from 'lucide-react';
import {importMarkdown} from './document';
import {MindMap} from './MindMap';
import {GoogleSignInButton} from './sync/GoogleSignInButton';
import './landing.css';

type LandingProps = {
  onLocal: () => void;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  onGoogleReady?: () => void;
  diagnostic?: string;
  disabled: boolean;
  error: string;
  busy: boolean;
};

const INK = '#262a26';
const TERRACOTTA = '#bf5538';
const GREEN = '#536c58';
const OCHRE = '#b58236';
const BLUE = '#627b9b';

type ArtNode = {text: string; x: number; y: number; w: number; color: string; kind: 'root' | 'branch' | 'leaf'};
type ArtPath = {d: string; color: string; width: number};
type ArtDot = {x: number; y: number; color: string};
type Art = {width: number; height: number; nodes: ArtNode[]; paths: ArtPath[]; dots: ArtDot[]};

const node = (text: string, x: number, y: number, w: number, color: string, kind: ArtNode['kind']): ArtNode => ({text, x, y, w, color, kind});
const path = (d: string, color: string, width: number): ArtPath => ({d, color, width});
const dot = (x: number, y: number, color: string): ArtDot => ({x, y, color});

/** Mapa do trecho "texto vira mapa": 600x300. */
const markdownArt: Art = {
  width: 600,
  height: 300,
  nodes: [
    node('Lançar meu portfólio', 10, 120, 190, INK, 'root'),
    node('Conteúdo', 250, 62, 78, TERRACOTTA, 'branch'),
    node('Design', 250, 182, 60, GREEN, 'branch'),
    node('Escolher 3 projetos', 390, 36, 172, TERRACOTTA, 'leaf'),
    node('Escrever sobre mim', 390, 88, 163, TERRACOTTA, 'leaf'),
    node('Paleta e tipografia', 390, 182, 172, GREEN, 'leaf'),
  ],
  paths: [
    path('M200 150 C 225 150 225 90 250 90', TERRACOTTA, 2.5),
    path('M200 150 C 225 150 225 210 250 210', GREEN, 2.5),
    path('M328 90 C 359 90 359 64 390 64', TERRACOTTA, 2),
    path('M328 90 C 359 90 359 116 390 116', TERRACOTTA, 2),
    path('M310 210 L 390 210', GREEN, 2),
  ],
  dots: [dot(200, 150, INK), dot(328, 90, TERRACOTTA), dot(310, 210, GREEN)],
};

/** Ilustração do modo "Mapa mental": 540x280. */
const modeMapArt: Art = {
  width: 540,
  height: 280,
  nodes: [
    node('Plano de estudos', 40, 110, 150, INK, 'root'),
    node('Teoria', 260, 42, 70, TERRACOTTA, 'branch'),
    node('Prática', 260, 112, 70, GREEN, 'branch'),
    node('Revisão', 260, 182, 84, BLUE, 'branch'),
  ],
  paths: [
    path('M190 140 C 225 140 225 70 260 70', TERRACOTTA, 2.5),
    path('M190 140 C 225 140 225 140 260 140', GREEN, 2.5),
    path('M190 140 C 225 140 225 210 260 210', BLUE, 2.5),
  ],
  dots: [dot(190, 140, INK)],
};

const examples = [
  {
    name: 'Portfólio',
    markdown: '# Lançar meu portfólio\n## Conteúdo\n### Escolher 3 projetos\n### Escrever sobre mim\n## Design\n### Paleta e tipografia\n### Layout para celular\n## Código\n### Next.js e TypeScript\n### Publicar na Cloudflare\n## Divulgação\n### Atualizar o LinkedIn\n### Subir no GitHub',
    compact: '# Lançar meu portfólio\n## Conteúdo\n### Projetos\n## Design\n### Paleta\n## Código\n### Publicar\n## Divulgação\n### LinkedIn',
  },
  {
    name: 'Entrevista',
    markdown: '# Preparar entrevista\n## Conhecer a empresa\n### Produto e clientes\n### Cultura e valores\n## Entender a vaga\n### Requisitos principais\n### Perguntas para o time\n## Contar minha história\n### Projetos relevantes\n### Resultados e aprendizados',
    compact: '# Entrevista\n## Empresa\n### Produto\n## Vaga\n### Perguntas\n## Minha história\n### Projetos',
  },
  {
    name: 'Estudos',
    markdown: '# Estudar PostgreSQL\n## Fundamentos\n### Tabelas e relações\n### Consultas SQL\n## Praticar\n### Criar um projeto\n### Analisar consultas\n## Revisar\n### Dúvidas frequentes\n### Próximos tópicos',
    compact: '# PostgreSQL\n## Aprender\n### Tabelas\n## Praticar\n### Consultas\n## Revisar\n### Dúvidas',
  },
  {
    name: 'Projeto',
    markdown: '# Lançar um projeto\n## Problema\n### Para quem é\n### O que precisa resolver\n## Construção\n### Primeira versão\n### O que testar\n## Próximos passos\n### Mostrar para pessoas\n### Aprender e ajustar',
    compact: '# Meu projeto\n## Problema\n### Para quem\n## Construir\n### Primeira versão\n## Aprender\n### Testar',
  },
];

/** Escala uma ilustração de tamanho fixo para caber na largura disponível, sem passar do tamanho original. */
function Fit({width, height, children}: {width: number; height: number; children: ReactNode}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const update = () => setScale(Math.min(1, element.clientWidth / width) || 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);
  return <div className="landing-fit" ref={box} style={{height: height * scale}}>
    <div className="landing-fit-inner" style={{width, height, transform: `scale(${scale})`, marginInline: scale === 1 ? 'auto' : 0}}>{children}</div>
  </div>;
}

function MapArt({art, extra}: {art: Art; extra?: ReactNode}) {
  return <div className="landing-art" style={{width: art.width, height: art.height}} aria-hidden="true">
    <svg width={art.width} height={art.height} viewBox={`0 0 ${art.width} ${art.height}`} fill="none" strokeLinecap="round">
      {art.paths.map((p, i) => <path key={i} d={p.d} stroke={p.color} strokeWidth={p.width}/>)}
      {art.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="5" fill="#fbfaf6" stroke={d.color} strokeWidth="2"/>)}
    </svg>
    {art.nodes.map(n => <div key={n.text} className={`landing-node landing-node-${n.kind}`} style={{left: n.x, top: n.y, width: n.w, borderBottomColor: n.color}}>{n.text}</div>)}
    {extra}
  </div>;
}

function CanvasArt() {
  return <div className="landing-art landing-art-canvas" style={{width: 540, height: 280}} aria-hidden="true">
    <svg width="540" height="280" viewBox="0 0 540 280" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M178 96 C 220 96 230 150 268 168" stroke="#8d8578" strokeWidth="1.8"/>
      <path d="M400 150 C 430 150 430 118 450 112" stroke="#8d8578" strokeWidth="1.8" strokeDasharray="5 5"/>
      <path d="M40 232 C 80 222 120 240 170 228 S 250 236 300 226" stroke="#e6b34a" strokeWidth="10" opacity="0.55"/>
      <path d="M330 52 C 350 36 372 66 392 48 S 424 40 440 54" stroke={TERRACOTTA} strokeWidth="2.4"/>
      <ellipse cx="470" cy="196" rx="38" ry="24" stroke={BLUE} strokeWidth="2"/>
    </svg>
    <div className="landing-card" style={{left: 44, top: 66, width: 134, borderColor: TERRACOTTA}}>Ideia solta</div>
    <div className="landing-card" style={{left: 268, top: 142, width: 132, borderColor: GREEN}}>Conexão</div>
    <div className="landing-card" style={{left: 450, top: 84, width: 76, borderColor: OCHRE}}>Dúvida</div>
  </div>;
}

function AppWindow({title, children}: {title: string; children: ReactNode}) {
  return <div className="landing-window" style={{width: 1120, height: 548}}>
    <div className="landing-window-bar" aria-hidden="true">
      <span className="landing-window-icon"><PanelLeft size={18} color="#4a4e46"/></span>
      <span className="landing-window-title">{title}</span>
      <span className="landing-window-tabs">
        <span className="is-on"><Network size={14}/>Mapa mental</span>
        <span><LayoutGrid size={14}/>Canvas livre</span>
      </span>
      <span className="landing-window-status">Salvo neste navegador</span>
      <span className="landing-window-icon"><Save size={18} color="#4a4e46"/></span>
      <span className="landing-window-icon"><Ellipsis size={18} color="#4a4e46"/></span>
      <span className="landing-window-icon"><UserRound size={18} color="#4a4e46"/></span>
    </div>
    <div className="landing-window-stage">{children}</div>
  </div>;
}

export function Landing({onLocal, onCredential, onError, onGoogleReady, diagnostic, disabled, error, busy}: LandingProps) {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const documents = useMemo(() => examples.map(example => importMarkdown(compact ? example.compact : example.markdown)), [compact]);
  const example = examples[exampleIndex];
  const doc = documents[exampleIndex];
  return <div className="landing-page" id="inicio">
    <header className="landing-header">
      <a className="landing-brand" href="#inicio" aria-label="Mynder, início"><span className="landing-brand-mark" aria-hidden="true">✳</span>mynder</a>
      <nav aria-label="Navegação da página">
        <a href="#modos">Como funciona</a>
        <a href="#ia">Com IA</a>
        <a href="#aberto">Código aberto</a>
        <a className="landing-header-cta" href="#comecar">Começar</a>
      </nav>
    </header>

    <main>
      <section className="landing-hero" aria-labelledby="landing-title">
        <h1 id="landing-title">Ideias não nascem <em>em linha reta.</em></h1>
        <div className="landing-hero-row">
          <p className="landing-lead">Dê forma ao que está na sua cabeça. Crie mapas mentais, conecte caminhos e encontre clareza para estudar, planejar ou criar.</p>
          <div className="landing-cta-block" id="comecar">
            <div className="landing-actions">
              <button type="button" className="landing-primary" onClick={onLocal}>Experimentar sem conta <span aria-hidden="true">→</span></button>
              <div className="landing-google"><GoogleSignInButton onCredential={onCredential} onError={onError} onReady={onGoogleReady} disabled={disabled} shape="pill"/></div>
            </div>
            {busy && <p className="landing-auth-status" role="status">Validando sua conta…</p>}
            {diagnostic && <p className="landing-auth-status" role="status">Diagnóstico do login: {diagnostic}</p>}
            {error && <p className="landing-auth-error" role="alert">{error}</p>}
            <p className="landing-privacy">Sem conta, os mapas ficam neste navegador. Com Google, você acessa os mapas da sua conta.</p>
          </div>
        </div>
      </section>

      <section className="landing-showcase" aria-label="Explore um mapa">
        {compact
          ? <div className="landing-phone-frame"><MindMap key={`${example.name}-compact`} doc={doc} onCreate={onLocal} maxInitialScale={2}/></div>
          : <Fit width={1120} height={548}><AppWindow title={doc.title}><MindMap key={example.name} doc={doc} onCreate={onLocal} maxInitialScale={2}/></AppWindow></Fit>}
        <div className="landing-examples">
          <div role="tablist" aria-label="Exemplos de mapas">
            {examples.map((item, index) => <button key={item.name} type="button" role="tab" aria-selected={index === exampleIndex} className={index === exampleIndex ? 'is-active' : ''} onClick={() => setExampleIndex(index)}>{item.name}</button>)}
          </div>
          <p>Amostra interativa: arraste para explorar e clique nos ramos para recolher. Seus mapas não são alterados.</p>
        </div>
      </section>

      <section className="landing-split" id="modos">
        <div className="landing-split-copy">
          <h2>Escreva em tópicos. O mapa se desenha sozinho.</h2>
          <p>Cole anotações em Markdown e cada título ou item vira um ramo. Mude o texto depois e o mapa se atualiza, mantendo os ramos que continuam iguais.</p>
          <pre className="landing-code" aria-label="Exemplo de texto em Markdown"><code><span><i># </i>Lançar meu portfólio</span>{'\n'}<span><i>## </i>Conteúdo</span>{'\n'}<span><b>- </b>Escolher 3 projetos</span>{'\n'}<span><b>- </b>Escrever sobre mim</span>{'\n'}<span><i>## </i>Design</span>{'\n'}<span><b>- </b>Paleta e tipografia</span></code></pre>
        </div>
        <div className="landing-split-art landing-only-wide">
          <Fit width={600} height={300}><div className="landing-panel" style={{width: 600, height: 300}}><MapArt art={markdownArt}/></div></Fit>
        </div>
      </section>

      <section className="landing-modes" aria-labelledby="modes-title">
        <h2 id="modes-title">Um quadro, dois jeitos de pensar.</h2>
        <div className="landing-modes-grid">
          <div>
            <Fit width={540} height={280}><div className="landing-panel" style={{width: 540, height: 280}}><MapArt art={modeMapArt}/></div></Fit>
            <h3>Mapa mental</h3>
            <p>Hierarquia clara. Abra e feche ramos para enxergar só o que importa agora.</p>
          </div>
          <div>
            <Fit width={540} height={280}><div className="landing-panel" style={{width: 540, height: 280}}><CanvasArt/></div></Fit>
            <h3>Canvas livre</h3>
            <p>Mova os nós, ligue ideias entre si e desenhe por cima, com caneta, marca-texto, formas e setas.</p>
          </div>
        </div>
      </section>

      <section className="landing-dark" aria-labelledby="dark-title">
        <div className="landing-dark-inner">
          <h2 id="dark-title">Funciona sem internet. Os mapas são seus.</h2>
          <div className="landing-facts">
            <div><h3>Offline</h3><p>Depois da primeira visita, o Mynder abre sem conexão neste navegador.</p></div>
            <div><h3>Privado por padrão</h3><p>Sem conta, os mapas ficam no seu navegador. Com Google, eles sincronizam com a sua conta e só você os vê.</p></div>
            <div><h3>Portátil</h3><p>Exporte um mapa em JSON ou faça o backup completo de todos de uma vez.</p></div>
          </div>
        </div>
      </section>

      <section className="landing-split landing-ai" id="ia" aria-labelledby="ai-title">
        <div className="landing-split-copy">
          <h2 id="ai-title">Peça a uma IA. O mapa aparece.</h2>
          <p>O Mynder inclui um servidor MCP. Conecte um assistente compatível, como o Claude, e peça mapas em linguagem natural. Ele cria, reorganiza e edita nó a nó, e o resultado aparece na sua conta em segundos.</p>
        </div>
        <div className="landing-chat">
          <div className="landing-bubble landing-bubble-user">Crie um mapa com o roteiro da minha entrevista de frontend.</div>
          <div className="landing-bubble landing-bubble-ai">Pronto. Criei o mapa “Roteiro da entrevista” com 8 ramos. Quer que eu detalhe as perguntas técnicas?</div>
          <div className="landing-chat-result"><span aria-hidden="true"/>Roteiro da entrevista · novo mapa na sua conta</div>
          <p className="landing-chat-note">Exemplo de conversa.</p>
        </div>
      </section>

      <section className="landing-final" aria-labelledby="final-title">
        <h2 id="final-title">Comece com <em>uma ideia.</em></h2>
        <div className="landing-actions">
          <button type="button" className="landing-primary" onClick={onLocal}>Experimentar sem conta</button>
          <a className="landing-secondary" href="#comecar">Entrar com Google</a>
        </div>
      </section>
    </main>

    <footer className="landing-footer" id="aberto">
      <a className="landing-brand" href="#inicio" aria-label="Mynder, voltar ao início"><span className="landing-brand-mark" aria-hidden="true">✳</span>mynder</a>
      <p>Código aberto, licença MIT.</p>
      <div className="landing-footer-links">
        <a href="https://github.com/RafalauriSantos/mynder" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://github.com/RafalauriSantos/mynder/blob/main/README.en.md" target="_blank" rel="noreferrer">README in English</a>
      </div>
    </footer>
  </div>;
}
