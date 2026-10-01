/*
 * ============================================================================
 * NETFLIX CLONE — script.js  (arquivo único)
 * ----------------------------------------------------------------------------
 * Script comum (não usa módulos ES), então funciona abrindo o index.html
 * direto no navegador, sem precisar de servidor local.
 *
 * ÍNDICE
 *   1. Configuração
 *   2. Camada de API (TMDb)
 *   3. Categorias
 *   4. Utilitário de DOM
 *   5. Hero (destaque + botão "Minha Lista")
 *   6. Carrosséis (cards, arrasto, setas, Top 10, skeleton, erro)
 *   7. Navbar
 *   8. Inicialização
 * ============================================================================
 */

(function () {
    'use strict'; // modo estrito: erros silenciosos viram erros visíveis


    /* ========================================================================
       1. CONFIGURAÇÃO
       Única fonte de chaves e URLs da aplicação.
       Atenção: em um site estático a chave do TMDb fica visível no navegador.
       Para protegê-la de verdade seria necessário um proxy no servidor.
       ======================================================================== */
    const CONFIG = Object.freeze({
        API_KEY:  '0a175c1a1b1940d68254d69f11760b67',
        API_BASE: 'https://api.themoviedb.org/3',
        IMG_BASE: 'https://image.tmdb.org/t/p',
        LANGUAGE: 'pt-BR',
    });

    /*
     * Tamanhos dos pôsteres. O navegador escolhe o menor arquivo que
     * cobre a largura real do card (dobrando em telas retina).
     * Os valores de "sizes" acompanham os breakpoints do CSS (seção 8).
     */
    const POSTER_WIDTHS = [185, 342, 500];
    const POSTER_SIZES = [
        '(min-width: 2560px) 205px',
        '(min-width: 1920px) 200px',
        '(min-width: 1600px) 190px',
        '(min-width: 1280px) 170px',
        '(min-width: 1024px) 150px',
        '(min-width: 768px) 135px',
        '(min-width: 600px) 130px',
        '(min-width: 400px) 120px',
        '128px',
    ].join(', ');


    /* ========================================================================
       2. CAMADA DE API (TMDb)
       ======================================================================== */

    /**
     * Faz um GET na API do TMDb. Adiciona language e api_key automaticamente.
     * Em caso de falha devolve null, sem quebrar o resto da página.
     * @param {string} path    Caminho da API. Ex.: '/discover/tv'
     * @param {Object} params  Parâmetros extras da query string
     * @returns {Promise<Object|null>}
     */
    async function tmdb(path, params = {}) {
        const url = new URL(CONFIG.API_BASE + path);
        url.search = new URLSearchParams({
            language: CONFIG.LANGUAGE,
            api_key:  CONFIG.API_KEY,
            ...params,
        });

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return await response.json();
        } catch (error) {
            console.error('[API] Falha ao buscar "' + path + '":', error.message);
            return null;
        }
    }

    /**
     * Monta a URL de uma imagem do TMDb.
     * @param {string|number} size  Ex.: 'w342' ou 'original'
     * @param {string} path         Caminho devolvido pela API (poster_path etc.)
     */
    const imageUrl = (size, path) => CONFIG.IMG_BASE + '/' + size + path;


    /* ========================================================================
       3. CATEGORIAS
       Para adicionar ou remover uma fileira, edite apenas esta lista.
         variant: 'top10' -> fileira numerada
         limit:   máximo de itens exibidos
       ======================================================================== */
    const CATEGORIES = [
        { slug: 'top10',     title: 'Top 10 hoje',            path: '/trending/all/day', variant: 'top10', limit: 10 },
        { slug: 'originals', title: 'Originais da Netflix',   path: '/discover/tv',      params: { with_network: 213 } },
        { slug: 'trending',  title: 'Recomendados para Você', path: '/trending/all/week' },
        { slug: 'toprated',  title: 'Em Alta',                path: '/movie/top_rated' },
        { slug: 'action',    title: 'Top Ação',               path: '/discover/movie',   params: { with_genres: 28 } },
        { slug: 'comedy',    title: 'Top Comédia',            path: '/discover/movie',   params: { with_genres: 35 } },
        { slug: 'drama',     title: 'Top Drama',              path: '/discover/movie',   params: { with_genres: 18 } },
    ];

    /**
     * Busca todas as categorias ao mesmo tempo (Promise.all = mais rápido).
     * Itens sem pôster são descartados.
     * @returns {Promise<Array>} [{ ...categoria, results: [...] }]
     */
    function fetchCategories() {
        return Promise.all(CATEGORIES.map(async (category) => {
            const data = await tmdb(category.path, category.params);
            const results = ((data && data.results) || [])
                .filter((item) => item.poster_path)
                .slice(0, category.limit);
            return { ...category, results };
        }));
    }


    /* ========================================================================
       4. UTILITÁRIO DE DOM
       ======================================================================== */

    /**
     * Cria um elemento HTML sem usar innerHTML.
     * Assim, textos vindos da API nunca são interpretados como HTML
     * (evita injeção de código).
     * @param {string} tag       Nome da tag. Ex.: 'div'
     * @param {Object} props     { class, text, ...atributos }. Valores null/false são ignorados.
     * @param {...Node} children Elementos filhos (null é ignorado)
     */
    function el(tag, props = {}, ...children) {
        const node = document.createElement(tag);

        for (const [key, value] of Object.entries(props)) {
            if (value == null || value === false) continue;
            if (key === 'class')     node.className = value;
            else if (key === 'text') node.textContent = value;
            else                     node.setAttribute(key, value === true ? '' : value);
        }

        node.append(...children.filter(Boolean));
        return node;
    }

    /** true se o usuário pediu "reduzir movimento" no sistema. */
    const prefersReducedMotion = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** Atalho para document.getElementById. */
    const $ = (id) => document.getElementById(id);


    /* ========================================================================
       5. HERO (DESTAQUE)
       ======================================================================== */

    /** Mostra mensagem de erro no hero quando a API falha. */
    function setHeroError() {
        $('featured-title').textContent = 'Conteúdo indisponível';
        $('featured-desc').textContent  = 'Não foi possível carregar o destaque. Tente novamente mais tarde.';
        $('featured-score').textContent = '';
        $('featured-year').textContent  = '';
    }

    /**
     * Pré-carrega a imagem de fundo e só a exibe quando estiver pronta
     * (o CSS faz o fade). Evita o "pulo" visual da imagem aparecendo aos poucos.
     * @param {string} url
     */
    function showHeroBackdrop(url) {
        const image = new Image();
        image.onload = function () {
            $('featured').style.setProperty('--hero-image', 'url(' + url + ')');
            $('featured').classList.add('is-loaded');
        };
        image.src = url;
    }

    /**
     * Preenche o hero com um título aleatório da lista recebida.
     * Busca os detalhes completos (sinopse, nota) do título escolhido.
     * @param {Array} results  Itens da categoria "Originais"
     */
    async function renderHero(results = []) {
        if (!results.length) return setHeroError();

        const chosen  = results[Math.floor(Math.random() * results.length)];
        const details = await tmdb('/tv/' + chosen.id);
        if (!details) return setHeroError();

        $('featured-title').textContent = details.name || 'Título indisponível';

        $('featured-score').textContent = details.vote_average
            ? details.vote_average.toFixed(1) + ' pontos'
            : 'Sem avaliação';

        // slice pega só o ano do texto "AAAA-MM-DD" (evita erro de fuso horário do Date)
        $('featured-year').textContent = (details.first_air_date || '').slice(0, 4) || '----';

        $('featured-desc').textContent = details.overview || 'Descrição indisponível.';

        if (details.backdrop_path) showHeroBackdrop(imageUrl('w1280', details.backdrop_path));
    }

    /**
     * Botão "Minha Lista": alterna entre adicionado / não adicionado.
     * aria-pressed informa o estado a leitores de tela; o CSS pinta o botão de branco.
     */
    function initWatchlistButton() {
        const button = $('featured-list-btn');
        const label  = button.querySelector('span');

        button.addEventListener('click', function () {
            const added = button.getAttribute('aria-pressed') !== 'true';
            button.setAttribute('aria-pressed', String(added));
            label.textContent = added ? '✓ Na lista' : '+ Minha Lista';
        });
    }


    /* ========================================================================
       6. CARROSSÉIS
       Estrutura gerada para cada fileira:
       section.movie-row
         ├─ h2.movie-row__title
         └─ div.movie-row__viewport
              ├─ button.movie-row__arrow--prev
              ├─ div.movie-row__scroll > ul|ol.movie-row__list > li.movie-card
              └─ button.movie-row__arrow--next
       ======================================================================== */

    const SCROLL_STEP    = 0.85; // fração da largura visível rolada a cada clique nas setas
    const DRAG_THRESHOLD = 5;    // px de movimento até contar como arrasto (e não clique)
    const DRAG_SPEED     = 1.5;  // multiplicador da velocidade do arrasto

    /* ---------- 6.1 Card ---------- */

    /**
     * Cria um card (pôster). Se rank > 0, adiciona o número do Top 10.
     * @param {Object} item  Filme/série da API
     * @param {number} rank  Posição no Top 10 (0 = card comum)
     * @returns {HTMLLIElement}
     */
    function buildCard(item, rank) {
        const name   = item.title || item.name || 'Sem título';
        const poster = item.poster_path;

        // srcset: o navegador escolhe o arquivo ideal para o tamanho/densidade da tela
        const srcset = POSTER_WIDTHS
            .map((w) => imageUrl('w' + w, poster) + ' ' + w + 'w')
            .join(', ');

        const img = el('img', {
            src:      imageUrl('w342', poster),
            srcset:   srcset,
            sizes:    POSTER_SIZES,
            alt:      '',              // vazio de propósito: o nome já está no aria-label do botão
            width:    200,             // width/height reservam espaço e evitam "pulo" de layout
            height:   300,
            loading:  'lazy',          // só baixa quando a fileira se aproxima da tela
            decoding: 'async',
        });

        const button = el('button', {
            type:         'button',
            class:        'movie-card__btn',
            'aria-label': rank ? rank + '. ' + name : name,
        },
            img,
            el('span', { class: 'movie-card__title', 'aria-hidden': 'true', text: name })
        );

        return el('li', { class: rank ? 'movie-card movie-card--ranked' : 'movie-card' },
            rank ? el('span', { class: 'movie-card__rank', 'aria-hidden': 'true', text: rank }) : null,
            button
        );
    }

    /* ---------- 6.2 Interação: arrastar com o mouse ---------- */

    /**
     * Permite arrastar a fileira com o mouse (no toque, o scroll nativo já funciona).
     * @param {HTMLElement} scroller  Elemento .movie-row__scroll
     */
    function enableDrag(scroller) {
        let isDown    = false;
        let moved     = false;
        let startX    = 0;
        let startLeft = 0;

        scroller.addEventListener('pointerdown', function (e) {
            if (e.pointerType !== 'mouse' || e.button !== 0) return;
            isDown    = true;
            moved     = false;
            startX    = e.clientX;
            startLeft = scroller.scrollLeft;
        });

        scroller.addEventListener('pointermove', function (e) {
            if (!isDown) return;
            const dx = e.clientX - startX;

            if (Math.abs(dx) > DRAG_THRESHOLD) {
                moved = true;
                scroller.classList.add('is-dragging');
            }
            if (moved) scroller.scrollLeft = startLeft - dx * DRAG_SPEED;
        });

        function stopDrag() {
            isDown = false;
            scroller.classList.remove('is-dragging');
        }
        scroller.addEventListener('pointerup', stopDrag);
        scroller.addEventListener('pointerleave', stopDrag);

        // Soltar o mouse sobre um card depois de arrastar NÃO deve contar como clique
        scroller.addEventListener('click', function (e) {
            if (moved) {
                e.preventDefault();
                e.stopPropagation();
                moved = false;
            }
        }, true);
    }

    /* ---------- 6.3 Interação: setas ---------- */

    /**
     * Liga as setas ao carrossel e desabilita cada seta no início/fim da fileira.
     * @param {HTMLElement} scroller
     * @param {HTMLButtonElement} prev
     * @param {HTMLButtonElement} next
     */
    function bindScroller(scroller, prev, next) {
        function updateArrows() {
            const max = scroller.scrollWidth - scroller.clientWidth;
            prev.disabled = scroller.scrollLeft <= 1;
            next.disabled = scroller.scrollLeft >= max - 1;
        }

        function go(direction) {
            scroller.scrollBy({
                left:     direction * scroller.clientWidth * SCROLL_STEP,
                behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            });
        }

        prev.addEventListener('click', () => go(-1));
        next.addEventListener('click', () => go(1));
        scroller.addEventListener('scroll', updateArrows, { passive: true });
        new ResizeObserver(updateArrows).observe(scroller); // recalcula ao girar/redimensionar a tela

        enableDrag(scroller);
    }

    /** Cria um botão de seta. */
    function buildArrow(side, label, glyph) {
        return el('button', {
            type:         'button',
            class:        'movie-row__arrow movie-row__arrow--' + side,
            'aria-label': label,
        }, el('span', { 'aria-hidden': 'true', text: glyph }));
    }

    /* ---------- 6.4 Fileira ---------- */

    /**
     * Monta uma fileira completa (título + setas + cards).
     * Top 10 usa <ol> (lista ordenada); as demais, <ul>.
     * @param {Object} category  { slug, title, variant, results }
     * @returns {HTMLElement}
     */
    function buildRow(category) {
        const ranked    = category.variant === 'top10';
        const headingId = 'row-' + category.slug;

        const cards = category.results.map((item, i) => buildCard(item, ranked ? i + 1 : 0));
        const list  = el(ranked ? 'ol' : 'ul', { class: 'movie-row__list' }, ...cards);

        const scroller = el('div', { class: 'movie-row__scroll' }, list);
        const prev     = buildArrow('prev', 'Anterior', '‹');
        const next     = buildArrow('next', 'Próximo', '›');
        bindScroller(scroller, prev, next);

        return el('section', {
            class:             ranked ? 'movie-row movie-row--top10' : 'movie-row',
            'aria-labelledby': headingId,
        },
            el('h2', { class: 'movie-row__title', id: headingId, text: category.title }),
            el('div', { class: 'movie-row__viewport' }, prev, scroller, next)
        );
    }

    /* ---------- 6.5 Estados da página: carregando e erro ---------- */

    /**
     * Mostra fileiras "fantasma" enquanto a API responde.
     * @param {HTMLElement} container
     * @param {number} count  Quantidade de fileiras fantasma
     */
    function renderSkeleton(container, count = 3) {
        container.setAttribute('aria-busy', 'true');

        const rows = Array.from({ length: count }, function () {
            const cards = Array.from({ length: 12 }, () => el('div', { class: 'skeleton skeleton--card' }));
            return el('div', { class: 'movie-row movie-row--skeleton', 'aria-hidden': 'true' },
                el('div', { class: 'skeleton skeleton--title' }),
                el('div', { class: 'movie-row__scroll' }, ...cards)
            );
        });

        container.replaceChildren(...rows);
    }

    /**
     * Renderiza as fileiras. Se nenhuma categoria tiver dados,
     * mostra uma mensagem de erro com botão "Tentar novamente".
     * @param {HTMLElement} container
     * @param {Array} categories
     * @param {Function} onRetry  Chamada ao clicar em "Tentar novamente"
     */
    function renderRows(container, categories, onRetry) {
        container.removeAttribute('aria-busy');

        const rows = categories.filter((c) => c.results.length).map(buildRow);

        if (!rows.length) {
            const retry = el('button', { type: 'button', class: 'btn btn--list', text: 'Tentar novamente' });
            retry.addEventListener('click', onRetry);

            container.replaceChildren(
                el('div', { class: 'lists__error', role: 'alert' },
                    el('p', { text: 'Não foi possível carregar os títulos. Verifique sua conexão e tente novamente.' }),
                    retry
                )
            );
            return;
        }

        container.replaceChildren(...rows);
    }


    /* ========================================================================
       7. NAVBAR
       ======================================================================== */

    /** Deixa o fundo da navbar sólido quando a página é rolada. */
    function initNavbar() {
        const navbar = $('navbar');
        const update = () => navbar.classList.toggle('navbar--scrolled', window.scrollY > 10);

        window.addEventListener('scroll', update, { passive: true }); // passive: melhora a rolagem
        update();
    }


    /* ========================================================================
       8. INICIALIZAÇÃO
       Ordem: interações que não dependem da API -> busca de dados -> render.
       ======================================================================== */

    /** Carrega a home: skeleton -> dados -> fileiras -> hero. */
    async function loadHome() {
        const lists = $('lists');
        renderSkeleton(lists);

        try {
            const categories = await fetchCategories();

            // As fileiras aparecem primeiro, sem esperar o hero
            renderRows(lists, categories, loadHome);

            const originals = categories.find((c) => c.slug === 'originals');
            await renderHero(originals && originals.results);
        } catch (error) {
            console.error('[Init] Erro crítico na inicialização:', error);
        }
    }

    initNavbar();
    initWatchlistButton();
    loadHome();

})();
