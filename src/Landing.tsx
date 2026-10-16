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
          <p>Arraste para explorar e clique nos ramos para recolher.</p>
        </div>
        <ul className="landing-facts">
          <li>Funciona sem internet</li>
          <li>Seus mapas ficam no seu navegador</li>
          <li>Exporte quando quiser</li>
        </ul>
      </section>

      <section className="landing-ai" id="ia" aria-labelledby="ai-title">
        <div className="landing-ai-copy">
          <h2 id="ai-title">Qualquer IA pode ajudar.</h2>
          <p>O Mynder tem um servidor MCP. Conecte o assistente de IA que você usa, desde que ele fale MCP, e peça mapas em linguagem natural. Ele cria e edita, e o mapa aparece na sua conta em segundos.</p>
        </div>
        <div className="landing-chat" role="img" aria-label="Exemplo: o pedido a uma IA e o novo mapa criado na conta">
          <div className="landing-bubble">Monte um mapa com o plano da minha semana.</div>
          <div className="landing-chat-result"><span aria-hidden="true"/>Plano da semana · novo mapa na sua conta</div>
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
