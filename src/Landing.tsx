import {useEffect, useMemo, useState} from 'react';
import {importMarkdown} from './document';
import {MindMap} from './MindMap';
import {GoogleSignInButton} from './sync/GoogleSignInButton';
import './landing.css';

type LandingProps = {
  onLocal: () => void;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  disabled: boolean;
  error: string;
  busy: boolean;
};

const examples = [
  {
    name: 'Entrevista',
    heading: 'Uma entrevista começa antes da conversa.',
    markdown: '# Preparar entrevista\n## Conhecer a empresa\n### Produto e clientes\n### Cultura e valores\n## Entender a vaga\n### Requisitos principais\n### Perguntas para o time\n## Contar minha história\n### Projetos relevantes\n### Resultados e aprendizados',
    mobileMarkdown: '# Entrevista\n## Empresa\n### Produto\n## Vaga\n### Perguntas\n## Minha história\n### Projetos',
  },
  {
    name: 'Estudos',
    heading: 'Enxergue o assunto inteiro.',
    markdown: '# Estudar PostgreSQL\n## Fundamentos\n### Tabelas e relações\n### Consultas SQL\n## Praticar\n### Criar um projeto\n### Analisar consultas\n## Revisar\n### Dúvidas frequentes\n### Próximos tópicos',
    mobileMarkdown: '# PostgreSQL\n## Aprender\n### Tabelas\n## Praticar\n### Consultas\n## Revisar\n### Dúvidas',
  },
  {
    name: 'Projeto',
    heading: 'Dê um lugar para cada ideia.',
    markdown: '# Lançar um projeto\n## Problema\n### Para quem é\n### O que precisa resolver\n## Construção\n### Primeira versão\n### O que testar\n## Próximos passos\n### Mostrar para pessoas\n### Aprender e ajustar',
    mobileMarkdown: '# Meu projeto\n## Problema\n### Para quem\n## Construir\n### Primeira versão\n## Aprender\n### Testar',
  },
];

export function Landing({onLocal, onCredential, onError, disabled, error, busy}: LandingProps) {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  const documents = useMemo(() => examples.map(example => importMarkdown(compact ? example.mobileMarkdown : example.markdown)), [compact]);
  const example = examples[exampleIndex];

  useEffect(() => {
    const query = window.matchMedia('(max-width: 600px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return <div className="landing-page" id="inicio">
    <header className="landing-header">
      <div className="landing-header-inner">
        <a className="landing-brand" href="#inicio" aria-label="Mynder, início"><span className="landing-brand-mark" aria-hidden="true">✳</span><span>mynder</span></a>
        <nav aria-label="Navegação da página"><a href="#amostra">Explore um mapa</a><a href="#como-funciona">Como funciona</a></nav>
        <a className="landing-header-cta" href="#comecar">Começar <span aria-hidden="true">↗</span></a>
      </div>
    </header>

    <main>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <p className="landing-overline"><span aria-hidden="true"/> UM LUGAR PARA PENSAR VISUALMENTE</p>
            <h1 id="landing-title">Ideias não nascem <em>em linha reta.</em></h1>
            <p className="landing-lead">Dê forma ao que está na sua cabeça. Crie mapas mentais, conecte caminhos e encontre clareza para estudar, planejar ou criar.</p>
            <div className="landing-actions" id="comecar">
              <div className="landing-google"><GoogleSignInButton onCredential={onCredential} onError={onError} disabled={disabled}/></div>
              <button className="landing-local" onClick={onLocal}>Experimentar sem conta <span aria-hidden="true">↗</span></button>
            </div>
            {busy && <p className="landing-auth-status" role="status">Validando sua conta…</p>}
            {error && <p className="landing-auth-error" role="alert">{error}</p>}
            <p className="landing-privacy">Sem conta, os mapas ficam neste navegador. Com Google, você acessa os mapas da sua conta.</p>
          </div>
          <div className="landing-hero-art" aria-hidden="true">
            <span className="landing-art-caption">pensamento em movimento / 01</span>
            <svg viewBox="0 0 500 400" fill="none" role="presentation">
              <path d="M160 223C221 223 206 84 300 84M160 223C240 223 228 219 337 219M160 223C223 223 217 355 303 355" stroke="#CCDFBE" strokeWidth="1.5"/>
              <path d="M337 219C400 219 395 147 449 147M337 219C407 219 404 297 451 297" stroke="#CCDFBE" strokeWidth="1.5" strokeDasharray="5 6"/>
              <rect x="90" y="190" width="140" height="66" rx="18" fill="#F2E8D3"/>
              <rect x="244" y="57" width="112" height="54" rx="16" fill="#D9A873"/>
              <rect x="276" y="192" width="122" height="54" rx="16" fill="#B6C7A5"/>
              <rect x="243" y="328" width="120" height="54" rx="16" fill="#D6B7A6"/>
              <circle cx="449" cy="147" r="5" fill="#D9A873"/><circle cx="451" cy="297" r="5" fill="#D6B7A6"/>
              <text x="160" y="228" textAnchor="middle" fill="#193830">SUA IDEIA</text>
              <text x="300" y="89" textAnchor="middle" fill="#193830">explorar</text>
              <text x="337" y="224" textAnchor="middle" fill="#193830">conectar</text>
              <text x="303" y="360" textAnchor="middle" fill="#193830">descobrir</text>
            </svg>
          </div>
        </div>
      </section>

      <section className="landing-showcase" id="amostra" aria-labelledby="sample-title">
        <div className="landing-showcase-heading"><div><p className="landing-section-label">O MYNDER POR DENTRO</p><h2 id="sample-title">Veja a ideia ganhar forma.</h2></div><p>Toque nos exemplos e explore o mapa. Esta amostra é interativa e não altera seus mapas.</p></div>
        <div className="landing-workspace">
          <div className="landing-workspace-top"><div className="landing-window-dots" aria-hidden="true"><i/><i/><i/></div><span>mynder <b> / </b> espaço de ideias</span><span className="landing-workspace-badge">AMOSTRA</span></div>
          <div className="landing-workspace-body">
            <div className="landing-workspace-side"><span className="landing-workspace-side-label">EXEMPLOS</span><div role="tablist" aria-label="Exemplos de mapas">{examples.map((item,index) => <button key={item.name} role="tab" aria-selected={index===exampleIndex} aria-controls="landing-map-panel" className={index===exampleIndex?'is-active':''} onClick={()=>setExampleIndex(index)}><span aria-hidden="true">◇</span>{item.name}<span aria-hidden="true">↗</span></button>)}</div><p>Troque de assunto. O jeito de pensar continua seu.</p></div>
            <div className="landing-workspace-main" id="landing-map-panel" role="tabpanel" aria-label={`Mapa de ${example.name}`}>
              <div className="landing-map-toolbar"><span><i aria-hidden="true"/> Mapa mental</span><span>{example.heading}</span></div>
              <div className="landing-map-canvas"><MindMap key={example.name} doc={documents[exampleIndex]} onCreate={onLocal} maxInitialScale={4}/></div>
              <div className="landing-map-caption"><span>Arraste para explorar · clique nos ramos para recolher</span><span>{String(exampleIndex+1).padStart(2,'0')} / 03</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-features" id="como-funciona" aria-labelledby="features-title">
        <div className="landing-feature-intro"><div><p className="landing-section-label">DA PRIMEIRA IDEIA AO TODO</p><h2 id="features-title">Pense do seu jeito.</h2></div><p>Uma tela para começar simples e aprofundar quando fizer sentido.</p></div>
        <div className="landing-feature-grid"><article><span>01 / ESTRUTURE</span><h3>Comece com texto.</h3><p>Escreva ou cole anotações em Markdown e transforme os tópicos em um mapa mental.</p><div aria-hidden="true"># ideia<br/>　↳ um caminho<br/>　↳ outro caminho</div></article><article><span>02 / EXPLORE</span><h3>Abra outras conexões.</h3><p>Leve o mapa ao canvas para mover tópicos, desenhar e conectar ideias livremente.</p><div className="landing-feature-sketch" aria-hidden="true">○ <span>─ ─ ✳ ─ ─</span> ○</div></article><article><span>03 / CONTINUE</span><h3>Seu espaço acompanha você.</h3><p>Salve localmente ou entre com Google para manter os mapas da conta sincronizados.</p><div className="landing-feature-end" aria-hidden="true">um mapa de cada vez <span>↗</span></div></article></div>
      </section>
    </main>

    <footer className="landing-footer">
      <div className="landing-footer-main">
        <div className="landing-footer-identity"><a className="landing-brand" href="#inicio" aria-label="Mynder, voltar ao início"><span className="landing-brand-mark" aria-hidden="true">✳</span><span>mynder</span></a><p>Um lugar para dar forma às suas ideias.</p></div>
        <nav aria-label="Navegação do rodapé"><a href="#amostra">Explorar a amostra</a><a href="#como-funciona">Como funciona</a><a href="#comecar">Começar</a></nav>
      </div>
      <div className="landing-footer-bottom"><span>© {new Date().getFullYear()} Mynder</span><a href="#inicio">Voltar ao topo <span aria-hidden="true">↑</span></a></div>
    </footer>
  </div>;
}
