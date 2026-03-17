/**
 * Netflix Clone — script.js
 * Organizado em módulos funcionais:
 *   1. Configuração
 *   2. Camada de API (api.js inline)
 *   3. Definição de categorias
 *   4. Renderização (Hero + Listas)
 *   5. UI / Interações
 *   6. Inicialização
 */


/* ============================================================
   [1] CONFIGURAÇÃO
   Constantes globais centralizadas.
   ============================================================ */
const CONFIG = {
    API_KEY:    '0a175c1a1b1940d68254d69f11760b67',
    API_BASE:   'https://api.themoviedb.org/3',
    IMG_BASE:   'https://image.tmdb.org/t/p',
    LANGUAGE:   'pt-BR',
};


/* ============================================================
   [2] CAMADA DE API
   - basicFetch: função reutilizável com tratamento de erros
   - Retorna null em caso de falha (sem quebrar o fluxo)
   ============================================================ */

/**
 * Realiza um GET na API do TMDb.
 * @param {string} endpoint - Caminho da API (sem a base URL)
 * @returns {Promise<Object|null>}
 */
const basicFetch = async (endpoint) => {
    try {
        const response = await fetch(`${CONFIG.API_BASE}${endpoint}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`[API] Falha ao buscar "${endpoint}":`, error.message);
        return null;
    }
};

/**
 * Monta a query string padrão (language + api_key).
 * Centraliza parâmetros comuns para evitar repetição.
 * @param {string} [extra=''] - Parâmetros adicionais (sem "?")
 * @returns {string}
 */
const buildQuery = (extra = '') => {
    const base = `language=${CONFIG.LANGUAGE}&api_key=${CONFIG.API_KEY}`;
    return extra ? `${base}&${extra}` : base;
};


/* ============================================================
   [3] DEFINIÇÃO DE CATEGORIAS
   - Cada categoria tem slug, title e a chamada de API
   - Promise.all busca todas as categorias em paralelo (mais rápido)
   ============================================================ */

/**
 * Definição estática das categorias.
 * Fácil de adicionar ou remover categorias aqui.
 */
const CATEGORIES = [
    {
        slug:     'originals',
        title:    'Originais da Netflix',
        endpoint: `/discover/tv?with_network=213&${buildQuery()}`,
    },
    {
        slug:     'trending',
        title:    'Recomendados para Você',
        endpoint: `/trending/all/week?${buildQuery()}`,
    },
    {
        slug:     'toprated',
        title:    'Em Alta',
        endpoint: `/movie/top_rated?${buildQuery()}`,
    },
    {
        slug:     'action',
        title:    'Top Ação',
        endpoint: `/discover/movie?${buildQuery('with_genres=28')}`,
    },
    {
        slug:     'comedy',
        title:    'Top Comédia',
        endpoint: `/discover/movie?${buildQuery('with_genres=35')}`,
    },
    {
        slug:     'drama',
        title:    'Top Drama',
        endpoint: `/discover/movie?${buildQuery('with_genres=18')}`,
    },
];

/**
 * Busca todas as categorias em paralelo com Promise.all.
 * Retorna array com { slug, title, results[] }.
 * @returns {Promise<Array>}
 */
const fetchAllCategories = async () => {
    const results = await Promise.all(
        CATEGORIES.map(async (cat) => {
            const data = await basicFetch(cat.endpoint);
            return {
                slug:    cat.slug,
                title:   cat.title,
                results: data?.results ?? [],
            };
        })
    );

    return results;
};


/* ============================================================
   [4] RENDERIZAÇÃO

   4a. renderFeatured — Hero Section
   4b. renderMovieRows — Listas de filmes/séries
   ============================================================ */

/**
 * Preenche a seção Hero com um item aleatório dos Originais.
 * Busca detalhes completos do item escolhido para ter mais dados.
 * @param {Array} results - Lista de itens da categoria "originals"
 */
const renderFeatured = async (results) => {
    if (!results || results.length === 0) {
        setFeaturedError();
        return;
    }

    const randomIndex = Math.floor(Math.random() * results.length);
    const chosen = results[randomIndex];

    /* Busca detalhes completos (overview, vote_average, etc.) */
    const details = await basicFetch(`/tv/${chosen.id}?${buildQuery()}`);

    if (!details) {
        setFeaturedError();
        return;
    }

    /* Atualiza background */
    const featuredEl = document.getElementById('featured');
    if (details.backdrop_path) {
        featuredEl.style.backgroundImage =
            `url(${CONFIG.IMG_BASE}/original${details.backdrop_path})`;
    }

    /* Atualiza título */
    document.getElementById('featured-title').textContent =
        details.name || 'Título indisponível';

    /* Atualiza pontuação */
    const score = details.vote_average
        ? `${details.vote_average.toFixed(1)} pontos`
        : 'Sem avaliação';
    document.getElementById('featured-score').textContent = score;

    /* Atualiza ano */
    const year = details.first_air_date
        ? new Date(details.first_air_date).getFullYear()
        : '----';
    document.getElementById('featured-year').textContent = year;

    /* Atualiza descrição (truncada no CSS via -webkit-line-clamp) */
    document.getElementById('featured-desc').textContent =
        details.overview || 'Descrição indisponível.';
};

/**
 * Exibe mensagem de erro no Hero caso a API falhe.
 */
const setFeaturedError = () => {
    document.getElementById('featured-title').textContent = 'Conteúdo indisponível';
    document.getElementById('featured-desc').textContent  = 'Não foi possível carregar o destaque. Tente novamente mais tarde.';
};

/**
 * Constrói o HTML de uma categoria e retorna a string.
 * Separa a geração do HTML da inserção no DOM (mais performático).
 * @param {Object} category - { slug, title, results[] }
 * @returns {string} HTML da seção
 */
const buildMovieRowHTML = ({ title, results }) => {
    /* Filtra itens sem poster */
    const validItems = results.filter(item => item.poster_path);

    if (validItems.length === 0) return '';

    const itemsHTML = validItems.map(item => {
        const label = item.title || item.name || 'Sem título';
        return `
            <div class="movie-row__item">
                <img
                    src="${CONFIG.IMG_BASE}/w300${item.poster_path}"
                    alt="${label}"
                    loading="lazy"
                    width="150"
                    height="225"
                >
            </div>
        `;
    }).join('');

    /*
     * Estrutura BEM consistente com o CSS:
     * .movie-row > .movie-row__title + .movie-row__scroll > .movie-row__list > .movie-row__item
     */
    return `
        <section class="movie-row" aria-label="${title}">
            <h2 class="movie-row__title">${title}</h2>
            <div class="movie-row__scroll">
                <div class="movie-row__list">
                    ${itemsHTML}
                </div>
            </div>
        </section>
    `;
};

/**
 * Renderiza todas as categorias no <main id="lists">.
 * @param {Array} categories - Array de categorias com results
 */
const renderMovieRows = (categories) => {
    const container = document.getElementById('lists');

    const html = categories
        .map(buildMovieRowHTML)
        .join('');

    container.innerHTML = html;
};


/* ============================================================
   [5] UI / INTERAÇÕES

   5a. enableDragScrolling — Drag-to-scroll nos carrosséis
   5b. handleNavbarScroll — Fundo sólido ao rolar
   ============================================================ */

/**
 * Habilita drag-to-scroll em todos os .movie-row__scroll.
 * Usa delegação de eventos para lidar com elementos gerados dinamicamente.
 * Classe .is-dragging adicionada para feedback visual (cursor: grabbing no CSS).
 */
const enableDragScrolling = () => {
    const sliders = document.querySelectorAll('.movie-row__scroll');

    sliders.forEach(slider => {
        let isDragging = false;
        let startX;
        let scrollLeft;

        const onMouseDown = (e) => {
            isDragging = true;
            startX     = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
            slider.classList.add('is-dragging');
        };

        const onMouseLeaveOrUp = () => {
            isDragging = false;
            slider.classList.remove('is-dragging');
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x    = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 2;
            slider.scrollLeft = scrollLeft - walk;
        };

        slider.addEventListener('mousedown',  onMouseDown);
        slider.addEventListener('mouseleave', onMouseLeaveOrUp);
        slider.addEventListener('mouseup',    onMouseLeaveOrUp);
        slider.addEventListener('mousemove',  onMouseMove);
    });
};

/**
 * Adiciona/remove classe .navbar--scrolled conforme scroll da página.
 * Corrigido: classe renomeada de 'black' para 'navbar--scrolled' (padrão BEM).
 * O CSS usa .navbar--scrolled para o fundo sólido.
 */
const handleNavbarScroll = () => {
    const navbar    = document.getElementById('navbar');
    const threshold = 10;

    window.addEventListener('scroll', () => {
        navbar.classList.toggle('navbar--scrolled', window.scrollY > threshold);
    }, { passive: true }); /* passive: melhora performance de scroll */
};


/* ============================================================
   [6] INICIALIZAÇÃO
   - Busca dados em paralelo
   - Renderiza Hero e Listas
   - Ativa interações após DOM preenchido
   ============================================================ */

/**
 * Ponto de entrada principal.
 * Ordem: fetch → render → interações.
 */
const init = async () => {
    try {
        /* Busca todas as categorias em paralelo */
        const categories = await fetchAllCategories();

        /* Renderiza o Hero com os Originais da Netflix */
        const originalsCategory = categories.find(c => c.slug === 'originals');
        if (originalsCategory) {
            await renderFeatured(originalsCategory.results);
        } else {
            setFeaturedError();
        }

        /* Renderiza as listas de filmes */
        renderMovieRows(categories);

        /* Ativa drag-to-scroll após as listas serem inseridas no DOM */
        enableDragScrolling();

    } catch (error) {
        console.error('[Init] Erro crítico na inicialização:', error);
    }
};

/* Ativa o controle do navbar imediatamente (não depende da API) */
handleNavbarScroll();

/* Inicia o app */
init();
