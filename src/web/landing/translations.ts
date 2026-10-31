/**
 * The front page in Brazilian Portuguese and Spanish. index.html is the English source: every
 * element with data-i18n="key" (or an attribute named by data-i18n-<attr>="key") is replaced with
 * the text here when the build writes /pt-BR/ and /es/ (scripts/landingPages.ts). Each entry
 * carries the English it translates in a comment; when you change the English, change both
 * translations too. test/landing.test.ts fails if a key is missing or its markup tags differ.
 * Values are HTML: keep <code>, <strong> and <kbd> as in the English, and escape & as &amp;.
 */
import type { Locale } from '@shared/i18n'
import { PAGES_ES, PAGES_PT_BR } from './pageTranslations'

export type LandingCatalog = Record<string, string>


export const ptBR: LandingCatalog = {
  // REKCUT (also written RekCut) turns a recorded Rekordbox set into a YouTube-ready video or a 9:16 clip, right in your browser. It fills in the tracklist and artwork, suggests the best moments, and never uploads your recording. 3 free exports, then US$10/month or US$45 once.
  'meta.description': 'O REKCUT (também escrito RekCut) transforma um set gravado no Rekordbox em um vídeo pronto para o YouTube ou em um clipe 9:16, direto no navegador. Ele preenche a tracklist e as capas, sugere os melhores momentos e nunca envia sua gravação para a internet. 3 exportações grátis, depois US$ 10/mês ou US$ 45 uma vez.',
  // Turn a recorded Rekordbox set into a YouTube-ready visualizer and 9:16 clips. Automatic tracklist, artwork and transitions. Runs in your browser.
  'meta.ogDescription': 'Transforme um set gravado no Rekordbox em um visualizer pronto para o YouTube e em clipes 9:16. Tracklist, capas e transições automáticas. Roda no seu navegador.',
  // REKCUT turns a Rekordbox set into a waveform video and vertical clips.
  'meta.ogImageAlt': 'O REKCUT transforma um set do Rekordbox em um vídeo com forma de onda e clipes verticais.',
  // REKCUT (RekCut) — Rekordbox Set to YouTube Video &amp; Clip Maker
  'meta.title': 'REKCUT (RekCut) — Do set do Rekordbox para vídeo no YouTube e clipes',
  // REKCUT home
  'nav.home': 'Início do REKCUT',
  // Main navigation
  'nav.main': 'Navegação principal',
  // Skip to content
  'nav.skip': 'Pular para o conteúdo',
  // Features
  'nav.1': 'Recursos',
  // Clips
  'nav.2': 'Clipes',
  // How it works
  'nav.3': 'Como funciona',
  // Pricing
  'nav.4': 'Preços',
  // FAQ
  'nav.5': 'Perguntas',
  // Open the editor
  'nav.6': 'Abrir o editor',
  // EN
  'lang.code': 'PT',
  // Language: English
  'lang.label': 'Idioma: Português (Brasil)',
  // Preview of the REKCUT editor showing two tracks, decks A and B, and the set timeline
  'hero.previewLabel': 'Prévia do editor do REKCUT com duas faixas, os decks A e B e a linha do tempo do set',
  // For recorded Rekordbox sets
  'hero.1': 'Para sets gravados no Rekordbox',
  // Turn a recorded Rekordbox set into a YouTube video and 9:16 clips
  'hero.2': 'Transforme um set gravado no Rekordbox em vídeo para o YouTube e clipes 9:16',
  // Drop in a set you recorded in Rekordbox. REKCUT lines up the tracks, adds the artwork and builds a video that moves with your mix. Pick a moment for a short clip, or export the whole set. Your music stays on your computer.
  'hero.3': 'Solte um set que você gravou no Rekordbox. O REKCUT organiza as faixas, coloca as capas e monta um vídeo que se mexe com a sua mixagem. Escolha um momento para um clipe curto ou exporte o set inteiro. Sua música fica no seu computador.',
  // Start free with 3 exports
  'hero.4': 'Comece grátis com 3 exportações',
  // See how it works
  'hero.5': 'Veja como funciona',
  // Export
  'hero.6': 'Exportar',
  // Program
  'hero.7': 'Programa',
  // Clips
  'hero.8': 'Clipes',
  // Deck A · now
  'hero.9': 'Deck A · agora',
  // Deck B · next
  'hero.10': 'Deck B · próxima',
  // Set audio
  'hero.11': 'Áudio do set',
  // Deck A
  'hero.12': 'Deck A',
  // Deck B
  'hero.13': 'Deck B',
  // free exports
  'hero.14': 'exportações grátis',
  // clip length
  'hero.15': 'duração do clipe',
  // MP4 export
  'hero.16': 'exportação em MP4',
  // interface and video text
  'hero.17': 'interface e texto do vídeo',
  // What is REKCUT?
  'about.1': 'O que é o REKCUT?',
  // <strong>REKCUT turns a recorded Rekordbox set into a video for YouTube, or a short clip for Shorts, Reels and TikTok.</strong> Drop in the recording and the <code>.cue</code> file Rekordbox saves with it. REKCUT fills in the tracklist, adds the artwork and builds a video that moves with your mix. Pick a moment for a clip or export the full set, all in your browser.
  'about.2': '<strong>O REKCUT transforma um set gravado no Rekordbox em um vídeo para o YouTube, ou em um clipe curto para Shorts, Reels e TikTok.</strong> Solte a gravação e o arquivo <code>.cue</code> que o Rekordbox salva junto. O REKCUT preenche a tracklist, coloca as capas e monta um vídeo que se mexe com a sua mixagem. Escolha um momento para um clipe ou exporte o set completo, tudo no navegador.',
  // It is made for DJs who already record their sets and want a good-looking video without rebuilding the set in Premiere, DaVinci Resolve or CapCut. You get the full set and the shareable moments from one project, with the set's original audio.
  'about.3': 'Ele foi feito para DJs que já gravam seus sets e querem um vídeo bonito sem remontar o set no Premiere, no DaVinci Resolve ou no CapCut. Você tira o set completo e os momentos para compartilhar de um só projeto, com o áudio original do set.',
  // What the editor does
  'features.1': 'O que o editor faz',
  // Tracklist, artwork, clips and video in one project
  'features.2': 'Tracklist, capas, clipes e vídeo em um só projeto',
  // No more juggling a waveform tool, a folder of covers, a notes app and a video editor. REKCUT brings the whole job together, and saves as you go.
  'features.3': 'Chega de pular entre um programa de forma de onda, uma pasta de capas, um bloco de notas e um editor de vídeo. O REKCUT junta o trabalho todo e salva enquanto você edita.',
  // Your Rekordbox cue does the boring part
  'features.4': 'O cue do Rekordbox faz a parte chata',
  // Drop in the <code>.cue</code> file Rekordbox saves next to your recording. The tracklist fills itself in, and REKCUT makes a good first guess at where each track takes over. Fix anything later by ear.
  'features.5': 'Solte o arquivo <code>.cue</code> que o Rekordbox salva ao lado da gravação. A tracklist se preenche sozinha, e o REKCUT dá um bom primeiro palpite de onde cada faixa assume. Depois é só ajustar de ouvido.',
  // Titles and artists come straight from the cue
  'features.6': 'Títulos e artistas vêm direto do cue',
  // Every track lands on the right deck
  'features.7': 'Cada faixa cai no deck certo',
  // Edit, add or remove tracks whenever you like
  'features.8': 'Edite, adicione ou remova faixas quando quiser',
  // Transitions that look like a real mix
  'features.9': 'Transições com cara de mixagem de verdade',
  // The current track sits on the left. The next one appears on the right, then slides across when it takes over. Choose a smooth blend, a quick cut, or let REKCUT match the movement to the energy of the mix.
  'features.10': 'A faixa atual fica à esquerda. A próxima aparece à direita e desliza para o lugar quando assume. Escolha uma passagem suave, um corte rápido, ou deixe o REKCUT acompanhar a energia da mixagem.',
  // A waveform that moves with the mix
  'features.11': 'Uma forma de onda que anda com a mixagem',
  // A close-up waveform scrolls under the playhead, coloured by deck, so viewers see the kicks and the handovers coming. Put it at the top, middle or bottom, or hide it for a cleaner video.
  'features.12': 'Uma forma de onda ampliada passa sob o cursor, colorida por deck, para quem assiste ver os kicks e as passagens chegando. Coloque em cima, no meio ou embaixo, ou esconda para um vídeo mais limpo.',
  // Covers and titles already filled in
  'features.13': 'Capas e títulos já preenchidos',
  // REKCUT looks up artwork and track details for you. If a cover is missing, paste an image link or pick one from your computer. You can also search and use the result's title and artist.
  'features.14': 'O REKCUT busca as capas e os dados das faixas para você. Se faltar uma capa, cole o link de uma imagem ou escolha uma do seu computador. Você também pode pesquisar e usar o título e o artista do resultado.',
  // The best moments, found for you
  'features.15': 'Os melhores momentos, encontrados para você',
  // Open the Clips tab and REKCUT suggests transitions, drops and the strongest part of each track, best first. No scrubbing through two hours of audio to find the one moment worth posting.
  'features.16': 'Abra a aba Clipes e o REKCUT sugere transições, drops e o trecho mais forte de cada faixa, os melhores primeiro. Nada de vasculhar duas horas de áudio atrás do único momento que vale postar.',
  // Made for Shorts, Reels and TikTok
  'features.17': 'Feito para Shorts, Reels e TikTok',
  // Turn any moment into a vertical 9:16 clip, or export the whole set in 16:9 for YouTube. Clips can be anywhere from 5 to 180 seconds, with handy 15, 30 and 60 second buttons.
  'features.18': 'Transforme qualquer momento em um clipe vertical 9:16, ou exporte o set inteiro em 16:9 para o YouTube. Os clipes podem ter de 5 a 180 segundos, com botões práticos de 15, 30 e 60 segundos.',
  // Keeps clear of the app buttons
  'features.19': 'Longe dos botões dos apps',
  // Turn on the social safe area and the titles, cards and waveform stay away from the bottom and right edges, where Instagram and TikTok put their controls. Nothing important ends up hidden.
  'features.20': 'Ative a área segura para redes sociais e os títulos, cards e a forma de onda ficam longe das bordas de baixo e da direita, onde o Instagram e o TikTok colocam os controles. Nada importante fica escondido.',
  // Editing that feels like a DJ tool
  'features.21': 'Edição com jeito de ferramenta de DJ',
  // Drag a track on the timeline to change when it takes over, drag the mix-in area, or press <kbd>A</kbd>, <kbd>S</kbd> and <kbd>D</kbd> at the playhead. The preview is exactly what you'll export.
  'features.22': 'Arraste uma faixa na linha do tempo para mudar quando ela assume, arraste a área de entrada da mixagem, ou aperte <kbd>A</kbd>, <kbd>S</kbd> e <kbd>D</kbd> no cursor. A prévia é exatamente o que você vai exportar.',
  // Nothing gets lost
  'features.23': 'Nada se perde',
  // Your project saves itself as you work, and every change can be undone. Keep a copy as a <code>.djvis</code> file to open on another computer.
  'features.24': 'Seu projeto se salva enquanto você trabalha, e toda mudança pode ser desfeita. Guarde uma cópia como arquivo <code>.djvis</code> para abrir em outro computador.',
  // Make it look like your set
  'features.25': 'Deixe com a cara do seu set',
  // Change the title, colours, background and waveforms. The app and the words inside the video come in English, Brazilian Portuguese and Spanish.
  'features.26': 'Mude o título, as cores, o fundo e as formas de onda. O app e o texto dentro do vídeo estão em inglês, português do Brasil e espanhol.',
  // Export without waiting all night
  'features.27': 'Exporte sem esperar a noite toda',
  // Render up to 4K and keep working while it runs. The video keeps your set's original audio and plays anywhere an MP4 does.
  'features.28': 'Renderize em até 4K e continue trabalhando enquanto isso. O vídeo mantém o áudio original do set e toca em qualquer lugar que toque MP4.',
  // Chapters ready for the description
  'features.29': 'Capítulos prontos para a descrição',
  // REKCUT turns your tracklist into YouTube chapters you can paste straight into the description. One less thing to do after the upload.
  'features.30': 'O REKCUT transforma sua tracklist em capítulos do YouTube que você cola direto na descrição. Uma coisa a menos para fazer depois do upload.',
  // Fast with long sets
  'features.31': 'Rápido com sets longos',
  // A two-hour set is ready to edit in seconds, not minutes. Reopen it later and the tracklist, artwork and your edits are still there.
  'features.32': 'Um set de duas horas fica pronto para editar em segundos, não minutos. Abra de novo depois e a tracklist, as capas e suas edições continuam lá.',
  // The Clips tab on a 45-minute set, showing four ranked suggestions with scores, reasons and trim controls
  'clips.previewLabel': 'A aba Clipes em um set de 45 minutos, com quatro sugestões ordenadas, notas, motivos e controles de corte',
  // The best moments of the set, found and ranked
  'clips.1': 'Os melhores momentos do set, encontrados e ordenados',
  // REKCUT reads how the set moves and lines up the moments that stand on their own, best first: the drop, the takeover, the peak. Each one is scored, trimmed and exported without leaving the tab.
  'clips.2': 'O REKCUT lê como o set se move e separa os momentos que se sustentam sozinhos, os melhores primeiro: o drop, a passagem, o pico. Cada um ganha uma nota, é cortado e exportado sem sair da aba.',
  // 01 crazy times · 45:41 · 15 tracks
  'clips.3': '01 crazy times · 45:41 · 15 faixas',
  // Export
  'clips.4': 'Exportar',
  // Program
  'clips.5': 'Programa',
  // Clips
  'clips.6': 'Clipes',
  // All
  'clips.7': 'Todos',
  // Transitions
  'clips.8': 'Transições',
  // Drops
  'clips.9': 'Drops',
  // Peaks
  'clips.10': 'Picos',
  // Best first
  'clips.11': 'Melhores primeiro',
  // In set order
  'clips.12': 'Na ordem do set',
  // Transition
  'clips.13': 'Transição',
  // Best
  'clips.14': 'Melhor',
  // the drop lands on the takeover
  'clips.15': 'o drop cai quando a faixa assume',
  // Play
  'clips.16': 'Tocar',
  // Export
  'clips.17': 'Exportar',
  // Drop
  'clips.18': 'Drop',
  // Drop in This Life
  'clips.19': 'Drop em This Life',
  // bass back after an 18 s breakdown
  'clips.20': 'o grave volta depois de um breakdown de 18 s',
  // Exporting 64%
  'clips.21': 'Exportando 64%',
  // Play
  'clips.22': 'Tocar',
  // Cancel
  'clips.23': 'Cancelar',
  // Peak
  'clips.24': 'Pico',
  // Sonidero at full energy
  'clips.25': 'Sonidero com energia total',
  // the most driving stretch of the track
  'clips.26': 'o trecho mais intenso da faixa',
  // Play
  'clips.27': 'Tocar',
  // Export
  'clips.28': 'Exportar',
  // Transition
  'clips.29': 'Transição',
  // 24 s blend
  'clips.30': 'passagem de 24 s',
  // Play
  'clips.31': 'Tocar',
  // Export
  'clips.32': 'Exportar',
  // The Clips tab on a 45-minute, 15-track set. Every card carries its own start, end and length, and exports without leaving the tab.
  'clips.33': 'A aba Clipes em um set de 45 minutos e 15 faixas. Cada card tem seu próprio início, fim e duração, e exporta sem sair da aba.',
  // What it looks for
  'clips.34': 'O que ele procura',
  // Transitions
  'clips.35': 'Transições',
  // Where one track hands over to the next. The reason line says when a drop lands on the takeover, how long the blend was, or that it is a quick mix.
  'clips.36': 'Onde uma faixa passa para a próxima. A linha do motivo diz quando um drop cai na passagem, quanto durou a mixagem ou que foi uma troca rápida.',
  // Drops
  'clips.37': 'Drops',
  // Where the bass comes back after at least six seconds without it, with the length of the breakdown that came before.
  'clips.38': 'Onde o grave volta depois de pelo menos seis segundos sem ele, com a duração do breakdown que veio antes.',
  // Peaks
  'clips.39': 'Picos',
  // The most driving 15 seconds of a track, for the part of the set that is already lifting off.
  'clips.40': 'Os 15 segundos mais intensos de uma faixa, para a parte do set que já está decolando.',
  // What's left out
  'clips.41': 'O que fica de fora',
  // A suggestion that overlaps a better one by more than half is dropped, so the list does not repeat itself.
  'clips.42': 'Uma sugestão que se sobrepõe a uma melhor em mais da metade é descartada, para a lista não se repetir.',
  // What you can do with one
  'clips.43': 'O que dá para fazer com um clipe',
  // Read it
  'clips.44': 'Ler',
  // Every suggestion carries its kind, a title, a score out of 100 for how well it should work on its own, and the reason it was picked. The best one in the set is marked.
  'clips.45': 'Cada sugestão traz o tipo, um título, uma nota de 0 a 100 de quão bem deve funcionar sozinha e o motivo da escolha. A melhor do set vem marcada.',
  // Narrow it
  'clips.46': 'Filtrar',
  // Show only transitions, drops or peaks, and sort best first or in the order they happen in the set.
  'clips.47': 'Mostre só transições, drops ou picos, e ordene pelos melhores primeiro ou na ordem em que acontecem no set.',
  // Trim it
  'clips.48': 'Cortar',
  // Arrow the start and end, or snap to 15, 30 or 60 seconds. Clips stay between 5 and 180 seconds, and the key moment keeps its place inside the clip.
  'clips.49': 'Ajuste o início e o fim com as setas, ou encaixe em 15, 30 ou 60 segundos. Os clipes ficam entre 5 e 180 segundos, e o momento principal continua no lugar dentro do clipe.',
  // Frame it
  'clips.50': 'Enquadrar',
  // 9:16 or 16:9 sets the frame the clip plays and exports in.
  'clips.51': '9:16 ou 16:9 define o formato em que o clipe toca e é exportado.',
  // Use it
  'clips.52': 'Usar',
  // Play it in Program to see the visualizer on it, or export it from the card and follow the progress there.
  'clips.53': 'Toque no Programa para ver o visualizer nele, ou exporte pelo card e acompanhe o progresso ali mesmo.',
  // Four steps
  'how.1': 'Quatro passos',
  // How it works
  'how.2': 'Como funciona',
  // Five minutes from a Rekordbox recording to a clip, or a few more for a full set.
  'how.3': 'Cinco minutos de uma gravação do Rekordbox até um clipe, ou um pouco mais para um set completo.',
  // Record in Rekordbox
  'how.4': 'Grave no Rekordbox',
  // Use the REC panel. Rekordbox saves the audio and a <code>.cue</code> file next to it.
  'how.5': 'Use o painel REC. O Rekordbox salva o áudio e um arquivo <code>.cue</code> ao lado dele.',
  // Drop both files in
  'how.6': 'Solte os dois arquivos',
  // The recording and the cue sheet are enough to build the tracklist and place every takeover.
  'how.7': 'A gravação e o cue bastam para montar a tracklist e posicionar cada passagem.',
  // Fix the feel
  'how.8': 'Ajuste o feeling',
  // Press A, S and D at the playhead, or drag tracks on the timeline. Artwork and titles are already filled in.
  'how.9': 'Aperte A, S e D no cursor, ou arraste as faixas na linha do tempo. Capas e títulos já vêm preenchidos.',
  // Pick a clip or export the set
  'how.10': 'Escolha um clipe ou exporte o set',
  // Choose a ranked clip in 9:16, or export the full 16:9 set from 720p to 4K. Copy the chapters and upload.
  'how.11': 'Escolha um clipe da lista em 9:16, ou exporte o set completo em 16:9, de 720p a 4K. Copie os capítulos e faça o upload.',
  // Your set never leaves your computer
  'privacy.1': 'Seu set nunca sai do seu computador',
  // Your recording, the editing and the final video all happen on your computer. There is no upload progress bar because there is no upload, so even a huge two-hour set never has to travel anywhere.
  'privacy.2': 'A gravação, a edição e o vídeo final acontecem no seu computador. Não tem barra de upload porque não tem upload, então nem um set enorme de duas horas precisa viajar para lugar nenhum.',
  // Your account only keeps the basics: your name, email, plan and how many videos you've exported. It never receives your set, its file name, the tracklist or the artwork.
  'privacy.3': 'Sua conta guarda só o básico: seu nome, e-mail, plano e quantos vídeos você exportou. Ela nunca recebe o seu set, o nome do arquivo, a tracklist ou as capas.',
  // Your set stays yours
  'privacy.4': 'Seu set continua seu',
  // It is read and rendered on your computer.
  'privacy.5': 'Ele é lido e renderizado no seu computador.',
  // Your projects stay local
  'privacy.6': 'Seus projetos ficam no seu computador',
  // Saved in your browser, or as a file you can move.
  'privacy.7': 'Salvos no navegador, ou como um arquivo que você pode levar.',
  // Only the basics online
  'privacy.8': 'Só o básico na internet',
  // Your account and export count, nothing about the music.
  'privacy.9': 'Sua conta e o número de exportações, nada sobre a música.',
  // Start free, pay only if you keep exporting
  'pricing.1': 'Comece grátis e só pague se continuar exportando',
  // An export is one finished video, a full set or a single clip. Sign in with Google so your free exports follow you between browsers. If an export fails or you cancel it, you get it back.
  'pricing.2': 'Uma exportação é um vídeo pronto, um set completo ou um clipe. Entre com o Google para suas exportações grátis acompanharem você em qualquer navegador. Se uma exportação falhar ou você cancelar, ela volta para você.',
  // Free
  'pricing.3': 'Grátis',
  // 3 exports, once — not per month
  'pricing.4': '3 exportações, uma vez só — não por mês',
  // 3 set or clip exports
  'pricing.5': '3 exportações de set ou clipe',
  // Every editing feature
  'pricing.6': 'Todos os recursos de edição',
  // 9:16 and 16:9
  'pricing.7': '9:16 e 16:9',
  // 720p to 4K
  'pricing.8': 'De 720p a 4K',
  // Local processing
  'pricing.9': 'Processamento local',
  // Start free
  'pricing.10': 'Começar grátis',
  // Monthly
  'pricing.11': 'Mensal',
  // / month
  'pricing.12': '/ mês',
  // Unlimited exports while it runs
  'pricing.13': 'Exportações ilimitadas enquanto estiver ativo',
  // Unlimited set exports
  'pricing.14': 'Exportações de sets ilimitadas',
  // Unlimited clip exports
  'pricing.15': 'Exportações de clipes ilimitadas',
  // Cancel anytime
  'pricing.16': 'Cancele quando quiser',
  // Keeps working until the paid period ends
  'pricing.17': 'Continua funcionando até o fim do período pago',
  // All future editor features
  'pricing.18': 'Todos os recursos futuros do editor',
  // Choose Monthly
  'pricing.19': 'Escolher Mensal',
  // Lifetime
  'pricing.20': 'Vitalício',
  // once
  'pricing.21': 'uma vez',
  // Unlimited exports, forever
  'pricing.22': 'Exportações ilimitadas, para sempre',
  // Pay once, no renewals
  'pricing.23': 'Pague uma vez, sem renovação',
  // Unlimited set exports
  'pricing.24': 'Exportações de sets ilimitadas',
  // Unlimited clip exports
  'pricing.25': 'Exportações de clipes ilimitadas',
  // All future editor features
  'pricing.26': 'Todos os recursos futuros do editor',
  // Best value after 5 months
  'pricing.27': 'Compensa a partir de 5 meses',
  // Buy Lifetime
  'pricing.28': 'Comprar Vitalício',
  // <strong>How the free exports work.</strong> Everyone gets 3 exports once, not 3 per month. After that, pick Monthly or Lifetime to keep exporting. Editing, previewing and saving projects stay free.
  'pricing.29': '<strong>Como funcionam as exportações grátis.</strong> Todo mundo ganha 3 exportações uma vez, não 3 por mês. Depois disso, escolha Mensal ou Vitalício para continuar exportando. Editar, ver a prévia e salvar projetos continua grátis.',
  // <strong>How billing works.</strong> Checkout opens in a new tab. Monthly renews until you cancel, and a cancelled plan keeps working until the end of the paid month. Lifetime is a one-time payment.
  'pricing.30': '<strong>Como funciona a cobrança.</strong> O pagamento abre em uma nova aba. O Mensal renova até você cancelar, e um plano cancelado continua funcionando até o fim do mês pago. O Vitalício é um pagamento único.',
  // <strong>If checkout says “coming soon”.</strong> Payments aren't open everywhere yet. Your 3 free exports still work, and you won't be charged until checkout is available.
  'pricing.31': '<strong>Se o pagamento disser “em breve”.</strong> Os pagamentos ainda não estão abertos em todo lugar. Suas 3 exportações grátis continuam funcionando, e você não será cobrado até o pagamento estar disponível.',
  // What you stop doing by hand
  'compare.1': 'O que você para de fazer na mão',
  // The manual way
  'compare.2': 'Do jeito manual',
  // Type the tracklist out by hand
  'compare.3': 'Digitar a tracklist na mão',
  // Search each cover on a different site
  'compare.4': 'Procurar cada capa em um site diferente',
  // Cut every clip in a video editor, one at a time
  'compare.5': 'Cortar cada clipe em um editor de vídeo, um por um',
  // Re-export a second vertical version for Shorts
  'compare.6': 'Exportar de novo uma segunda versão vertical para os Shorts',
  // Type chapters into the YouTube description
  'compare.7': 'Digitar os capítulos na descrição do YouTube',
  // Upload a multi-gigabyte set to a cloud editor
  'compare.8': 'Enviar um set de vários gigabytes para um editor na nuvem',
  // The REKCUT way
  'compare.9': 'Do jeito REKCUT',
  // The cue fills in the tracklist for you
  'compare.10': 'O cue preenche a tracklist para você',
  // Artwork is looked up and attached to each track
  'compare.11': 'As capas são encontradas e colocadas em cada faixa',
  // Clips are picked from the set's own energy
  'compare.12': 'Os clipes são escolhidos pela energia do próprio set',
  // One click switches between 9:16 and 16:9
  'compare.13': 'Um clique troca entre 9:16 e 16:9',
  // Chapters are generated from the tracklist
  'compare.14': 'Os capítulos saem da tracklist',
  // The recording is processed locally
  'compare.15': 'A gravação é processada no seu computador',
  // What it works with
  'specs.1': 'Com o que funciona',
  // Recordings
  'specs.2': 'Gravações',
  // WAV, AIFF, FLAC, MP3, M4A, Ogg and WebM — the formats Rekordbox and most DJ gear produce
  'specs.3': 'WAV, AIFF, FLAC, MP3, M4A, Ogg e WebM — os formatos que o Rekordbox e a maioria dos equipamentos de DJ geram',
  // Tracklist
  'specs.4': 'Tracklist',
  // Rekordbox .cue, or add tracks yourself
  'specs.5': '.cue do Rekordbox, ou adicione as faixas você mesmo',
  // Your projects
  'specs.6': 'Seus projetos',
  // Saved in your browser, or as a .djvis file you can move
  'specs.7': 'Salvos no navegador, ou como um arquivo .djvis que você pode levar',
  // Video
  'specs.8': 'Vídeo',
  // MP4 that works on YouTube, Shorts, Reels and TikTok
  'specs.9': 'MP4 que funciona no YouTube, Shorts, Reels e TikTok',
  // Quality
  'specs.10': 'Qualidade',
  // 720p, 1080p, 1440p or 4K, in 16:9 or 9:16
  'specs.11': '720p, 1080p, 1440p ou 4K, em 16:9 ou 9:16',
  // Clip length
  'specs.12': 'Duração do clipe',
  // 5 to 180 seconds, with 15, 30 and 60 second shortcuts
  'specs.13': 'De 5 a 180 segundos, com atalhos de 15, 30 e 60 segundos',
  // Browser
  'specs.14': 'Navegador',
  // Chrome or Edge recommended. Firefox and Safari work too, but read fewer audio formats.
  'specs.15': 'Chrome ou Edge recomendados. Firefox e Safari também funcionam, mas leem menos formatos de áudio.',
  // Languages
  'specs.16': 'Idiomas',
  // English, Brazilian Portuguese and Spanish, for the app and the text in the video
  'specs.17': 'Inglês, português do Brasil e espanhol, no app e no texto do vídeo',
  // Account
  'specs.18': 'Conta',
  // Google sign-in for exports. Your set is never uploaded.
  'specs.19': 'Login com Google para exportar. Seu set nunca é enviado.',
  // Questions
  'faq.1': 'Perguntas',
  // What is the best way to make clips from a Rekordbox set?
  'faq.2': 'Qual é o melhor jeito de fazer clipes de um set do Rekordbox?',
  // REKCUT. Drop in your recording and the <code>.cue</code> file from Rekordbox, then open the Clips tab. It suggests the transitions, drops and biggest moments, best first. Pick one, trim it if you like, choose 9:16 or 16:9, and export. You don't have to hunt for the moment or rebuild the tracklist yourself.
  'faq.3': 'O REKCUT. Solte sua gravação e o arquivo <code>.cue</code> do Rekordbox e abra a aba Clipes. Ele sugere as transições, os drops e os maiores momentos, os melhores primeiro. Escolha um, corte se quiser, escolha 9:16 ou 16:9 e exporte. Você não precisa caçar o momento nem montar a tracklist sozinho.',
  // What is REKCUT?
  'faq.4': 'O que é o REKCUT?',
  // REKCUT is a browser app that turns a recorded Rekordbox set into a video. It lines up your tracks, adds artwork and builds a moving visual around your mix. Export the full set for YouTube or a short vertical clip for social media. Your recording stays on your computer. Some people write it <strong>RekCut</strong>.
  'faq.5': 'O REKCUT é um app de navegador que transforma um set gravado no Rekordbox em vídeo. Ele organiza suas faixas, coloca as capas e monta um visual que se mexe com a sua mixagem. Exporte o set completo para o YouTube ou um clipe vertical curto para as redes. Sua gravação fica no seu computador. Tem quem escreva <strong>RekCut</strong>.',
  // Is REKCUT free?
  'faq.6': 'O REKCUT é grátis?',
  // You get <strong>3 free exports</strong> — a full set or a clip each — once per account, after signing in with Google. After that, <strong>Monthly is US$10</strong> for unlimited exports while it runs, or <strong>Lifetime is US$45</strong> once for unlimited exports forever. If an export fails or you cancel it, you get it back.
  'faq.7': 'Você ganha <strong>3 exportações grátis</strong> — um set completo ou um clipe cada — uma vez por conta, depois de entrar com o Google. Depois disso, o <strong>Mensal custa US$ 10</strong> com exportações ilimitadas enquanto estiver ativo, ou o <strong>Vitalício custa US$ 45</strong> uma vez só, com exportações ilimitadas para sempre. Se uma exportação falhar ou você cancelar, ela volta para você.',
  // Does REKCUT upload my DJ set?
  'faq.8': 'O REKCUT envia meu set para a internet?',
  // No. Your recording, the editing and the final video all happen on your computer. The only things stored online are your account, your plan and how many videos you've exported — nothing about the music.
  'faq.9': 'Não. A gravação, a edição e o vídeo final acontecem no seu computador. As únicas coisas guardadas na internet são sua conta, seu plano e quantos vídeos você exportou — nada sobre a música.',
  // Does REKCUT work without Rekordbox?
  'faq.10': 'O REKCUT funciona sem o Rekordbox?',
  // Yes. The <code>.cue</code> file makes the tracklist automatic, but you can import a recording on its own and add tracks yourself. It's simply quicker when Rekordbox has already written the cue.
  'faq.11': 'Sim. O arquivo <code>.cue</code> deixa a tracklist automática, mas você pode importar só a gravação e adicionar as faixas você mesmo. Só é mais rápido quando o Rekordbox já escreveu o cue.',
  // Which audio formats can I import?
  'faq.12': 'Quais formatos de áudio posso importar?',
  // Most DJ recordings work: WAV, AIFF, FLAC, MP3, M4A, Ogg and WebM, among others. If your browser can play it, REKCUT can usually read it. Chrome and Edge handle the widest range.
  'faq.13': 'A maioria das gravações de DJ funciona: WAV, AIFF, FLAC, MP3, M4A, Ogg e WebM, entre outros. Se o seu navegador toca, o REKCUT normalmente consegue ler. Chrome e Edge aceitam a maior variedade.',
  // What video can I export?
  'faq.14': 'Que vídeo posso exportar?',
  // An MP4 you can upload to YouTube, Shorts, Reels or TikTok. Export the whole set in 16:9 or a clip in 9:16, from 720p up to 4K. REKCUT also writes the YouTube chapters for you.
  'faq.15': 'Um MP4 que você pode subir no YouTube, Shorts, Reels ou TikTok. Exporte o set inteiro em 16:9 ou um clipe em 9:16, de 720p até 4K. O REKCUT também escreve os capítulos do YouTube para você.',
  // Do I need to install anything?
  'faq.16': 'Preciso instalar alguma coisa?',
  // No. It runs in your browser, and Chrome or Edge are the smoothest choice. Your project saves as you go, and you can keep a copy as a <code>.djvis</code> file to open on another computer.
  'faq.17': 'Não. Ele roda no navegador, e Chrome ou Edge são a opção mais tranquila. Seu projeto se salva enquanto você edita, e você pode guardar uma cópia como arquivo <code>.djvis</code> para abrir em outro computador.',
  // Why do my videos show REKCUT?
  'faq.18': 'Por que meus vídeos mostram REKCUT?',
  // Videos exported on the free plan show the REKCUT name in the top-left, like a small signature, so viewers can find the tool that made them. Monthly and Lifetime remove it. Your track names, artwork and colours are yours to change on every plan.
  'faq.19': 'Os vídeos exportados no plano grátis mostram o nome REKCUT no canto superior esquerdo, como uma pequena assinatura, para quem assiste encontrar a ferramenta que fez o vídeo. O Mensal e o Vitalício tiram essa marca. Os nomes das faixas, as capas e as cores são seus para mudar em qualquer plano.',
  // How long does a set take to analyse and export?
  'faq.20': 'Quanto tempo leva para analisar e exportar um set?',
  // A two-hour set is usually ready to edit in a few seconds. Export time depends on your computer and the quality you choose; a modern laptop, especially one with a graphics card, will be much faster.
  'faq.21': 'Um set de duas horas normalmente fica pronto para editar em poucos segundos. O tempo de exportação depende do seu computador e da qualidade escolhida; um notebook moderno, principalmente com placa de vídeo, é bem mais rápido.',
  // Your set is already recorded, now make it look like it
  'cta.1': 'Seu set já está gravado, agora deixe ele com cara de vídeo',
  // Open the editor, drop in the recording and its cue, and export your first clip in minutes.
  'cta.2': 'Abra o editor, solte a gravação e o cue, e exporte seu primeiro clipe em minutos.',
  // Open REKCUT
  'cta.3': 'Abrir o REKCUT',
  // About
  'footer.aboutLabel': 'Sobre',
  // Product links
  'footer.productLabel': 'Links do produto',
  // Resources
  'footer.resourcesLabel': 'Recursos',
  // Rekordbox set visualizer and clip maker. Recorded sets stay on your computer.
  'footer.1': 'Visualizer e criador de clipes para sets do Rekordbox. Os sets gravados ficam no seu computador.',
  // Product
  'footer.2': 'Produto',
  // Open the editor
  'footer.3': 'Abrir o editor',
  // Features
  'footer.4': 'Recursos',
  // Clip maker
  'footer.5': 'Criador de clipes',
  // Pricing
  'footer.6': 'Preços',
  // Resources
  'footer.7': 'Materiais',
  // How it works
  'footer.8': 'Como funciona',
  // FAQ
  'footer.9': 'Perguntas',
  // Formats &amp; browsers
  'footer.10': 'Formatos e navegadores',
  // About
  'footer.11': 'Sobre',
  // Source on GitHub
  'footer.12': 'Código no GitHub',
  // Sitemap
  'footer.13': 'Mapa do site',
  // © 2026 REKCUT. Videos exported on the free plan carry the REKCUT mark.
  'footer.14': '© 2026 REKCUT. Os vídeos exportados no plano grátis levam a marca REKCUT.',
  // Built for DJs who record their sets
  'footer.15': 'Feito para DJs que gravam seus sets',
  // Legal
  'footer.legalLabel': 'Informações legais',
  // Legal
  'footer.16': 'Legal',
  // Pricing
  'footer.17': 'Preços',
  // Terms of service
  'footer.18': 'Termos de uso',
  // Refund policy
  'footer.19': 'Política de reembolso',
  // Privacy policy
  'footer.20': 'Política de privacidade',
  // Videos carry the REKCUT mark
  'pricing.32': 'Os vídeos levam a marca REKCUT',
  // No REKCUT mark on your videos
  'pricing.33': 'Sem a marca REKCUT nos seus vídeos'
}

export const es: LandingCatalog = {
  // REKCUT (also written RekCut) turns a recorded Rekordbox set into a YouTube-ready video or a 9:16 clip, right in your browser. It fills in the tracklist and artwork, suggests the best moments, and never uploads your recording. 3 free exports, then US$10/month or US$45 once.
  'meta.description': 'REKCUT (también escrito RekCut) convierte un set grabado en Rekordbox en un video listo para YouTube o en un clip 9:16, directamente en tu navegador. Completa la tracklist y las portadas, sugiere los mejores momentos y nunca sube tu grabación. 3 exportaciones gratis, luego US$10 al mes o US$45 una sola vez.',
  // Turn a recorded Rekordbox set into a YouTube-ready visualizer and 9:16 clips. Automatic tracklist, artwork and transitions. Runs in your browser.
  'meta.ogDescription': 'Convierte un set grabado en Rekordbox en un visualizer listo para YouTube y en clips 9:16. Tracklist, portadas y transiciones automáticas. Funciona en tu navegador.',
  // REKCUT turns a Rekordbox set into a waveform video and vertical clips.
  'meta.ogImageAlt': 'REKCUT convierte un set de Rekordbox en un video con forma de onda y clips verticales.',
  // REKCUT (RekCut) — Rekordbox Set to YouTube Video &amp; Clip Maker
  'meta.title': 'REKCUT (RekCut) — De tu set de Rekordbox a un video de YouTube y clips',
  // REKCUT home
  'nav.home': 'Inicio de REKCUT',
  // Main navigation
  'nav.main': 'Navegación principal',
  // Skip to content
  'nav.skip': 'Saltar al contenido',
  // Features
  'nav.1': 'Funciones',
  // Clips
  'nav.2': 'Clips',
  // How it works
  'nav.3': 'Cómo funciona',
  // Pricing
  'nav.4': 'Precios',
  // FAQ
  'nav.5': 'Preguntas',
  // Open the editor
  'nav.6': 'Abrir el editor',
  // EN
  'lang.code': 'ES',
  // Language: English
  'lang.label': 'Idioma: Español',
  // Preview of the REKCUT editor showing two tracks, decks A and B, and the set timeline
  'hero.previewLabel': 'Vista previa del editor de REKCUT con dos temas, los decks A y B y la línea de tiempo del set',
  // For recorded Rekordbox sets
  'hero.1': 'Para sets grabados en Rekordbox',
  // Turn a recorded Rekordbox set into a YouTube video and 9:16 clips
  'hero.2': 'Convierte un set grabado en Rekordbox en un video para YouTube y clips 9:16',
  // Drop in a set you recorded in Rekordbox. REKCUT lines up the tracks, adds the artwork and builds a video that moves with your mix. Pick a moment for a short clip, or export the whole set. Your music stays on your computer.
  'hero.3': 'Suelta un set que grabaste en Rekordbox. REKCUT ordena los temas, añade las portadas y arma un video que se mueve con tu mezcla. Elige un momento para un clip corto o exporta el set completo. Tu música se queda en tu computadora.',
  // Start free with 3 exports
  'hero.4': 'Empieza gratis con 3 exportaciones',
  // See how it works
  'hero.5': 'Mira cómo funciona',
  // Export
  'hero.6': 'Exportar',
  // Program
  'hero.7': 'Programa',
  // Clips
  'hero.8': 'Clips',
  // Deck A · now
  'hero.9': 'Deck A · ahora',
  // Deck B · next
  'hero.10': 'Deck B · siguiente',
  // Set audio
  'hero.11': 'Audio del set',
  // Deck A
  'hero.12': 'Deck A',
  // Deck B
  'hero.13': 'Deck B',
  // free exports
  'hero.14': 'exportaciones gratis',
  // clip length
  'hero.15': 'duración del clip',
  // MP4 export
  'hero.16': 'exportación en MP4',
  // interface and video text
  'hero.17': 'interfaz y texto del video',
  // What is REKCUT?
  'about.1': '¿Qué es REKCUT?',
  // <strong>REKCUT turns a recorded Rekordbox set into a video for YouTube, or a short clip for Shorts, Reels and TikTok.</strong> Drop in the recording and the <code>.cue</code> file Rekordbox saves with it. REKCUT fills in the tracklist, adds the artwork and builds a video that moves with your mix. Pick a moment for a clip or export the full set, all in your browser.
  'about.2': '<strong>REKCUT convierte un set grabado en Rekordbox en un video para YouTube, o en un clip corto para Shorts, Reels y TikTok.</strong> Suelta la grabación y el archivo <code>.cue</code> que Rekordbox guarda junto a ella. REKCUT completa la tracklist, añade las portadas y arma un video que se mueve con tu mezcla. Elige un momento para un clip o exporta el set completo, todo en tu navegador.',
  // It is made for DJs who already record their sets and want a good-looking video without rebuilding the set in Premiere, DaVinci Resolve or CapCut. You get the full set and the shareable moments from one project, with the set's original audio.
  'about.3': 'Está hecho para DJs que ya graban sus sets y quieren un video que se vea bien sin rearmar el set en Premiere, DaVinci Resolve o CapCut. Sacas el set completo y los momentos para compartir de un solo proyecto, con el audio original del set.',
  // What the editor does
  'features.1': 'Qué hace el editor',
  // Tracklist, artwork, clips and video in one project
  'features.2': 'Tracklist, portadas, clips y video en un solo proyecto',
  // No more juggling a waveform tool, a folder of covers, a notes app and a video editor. REKCUT brings the whole job together, and saves as you go.
  'features.3': 'Se acabó saltar entre un programa de formas de onda, una carpeta de portadas, una app de notas y un editor de video. REKCUT junta todo el trabajo y guarda mientras editas.',
  // Your Rekordbox cue does the boring part
  'features.4': 'El cue de Rekordbox hace la parte aburrida',
  // Drop in the <code>.cue</code> file Rekordbox saves next to your recording. The tracklist fills itself in, and REKCUT makes a good first guess at where each track takes over. Fix anything later by ear.
  'features.5': 'Suelta el archivo <code>.cue</code> que Rekordbox guarda junto a tu grabación. La tracklist se completa sola, y REKCUT hace una buena primera estimación de dónde entra cada tema. Luego ajusta lo que quieras de oído.',
  // Titles and artists come straight from the cue
  'features.6': 'Títulos y artistas salen directo del cue',
  // Every track lands on the right deck
  'features.7': 'Cada tema cae en el deck correcto',
  // Edit, add or remove tracks whenever you like
  'features.8': 'Edita, añade o quita temas cuando quieras',
  // Transitions that look like a real mix
  'features.9': 'Transiciones que parecen una mezcla de verdad',
  // The current track sits on the left. The next one appears on the right, then slides across when it takes over. Choose a smooth blend, a quick cut, or let REKCUT match the movement to the energy of the mix.
  'features.10': 'El tema actual queda a la izquierda. El siguiente aparece a la derecha y se desliza a su lugar cuando entra. Elige una transición suave, un corte rápido, o deja que REKCUT siga la energía de la mezcla.',
  // A waveform that moves with the mix
  'features.11': 'Una forma de onda que avanza con la mezcla',
  // A close-up waveform scrolls under the playhead, coloured by deck, so viewers see the kicks and the handovers coming. Put it at the top, middle or bottom, or hide it for a cleaner video.
  'features.12': 'Una forma de onda ampliada pasa bajo el cursor, coloreada por deck, para que quien mira vea venir los kicks y los cambios. Ponla arriba, en el medio o abajo, u ocúltala para un video más limpio.',
  // Covers and titles already filled in
  'features.13': 'Portadas y títulos ya completados',
  // REKCUT looks up artwork and track details for you. If a cover is missing, paste an image link or pick one from your computer. You can also search and use the result's title and artist.
  'features.14': 'REKCUT busca las portadas y los datos de los temas por ti. Si falta una portada, pega el enlace de una imagen o elige una de tu computadora. También puedes buscar y usar el título y el artista del resultado.',
  // The best moments, found for you
  'features.15': 'Los mejores momentos, encontrados por ti',
  // Open the Clips tab and REKCUT suggests transitions, drops and the strongest part of each track, best first. No scrubbing through two hours of audio to find the one moment worth posting.
  'features.16': 'Abre la pestaña Clips y REKCUT sugiere transiciones, drops y la parte más fuerte de cada tema, los mejores primero. Nada de recorrer dos horas de audio buscando el único momento que vale la pena publicar.',
  // Made for Shorts, Reels and TikTok
  'features.17': 'Hecho para Shorts, Reels y TikTok',
  // Turn any moment into a vertical 9:16 clip, or export the whole set in 16:9 for YouTube. Clips can be anywhere from 5 to 180 seconds, with handy 15, 30 and 60 second buttons.
  'features.18': 'Convierte cualquier momento en un clip vertical 9:16, o exporta el set completo en 16:9 para YouTube. Los clips pueden durar de 5 a 180 segundos, con botones prácticos de 15, 30 y 60 segundos.',
  // Keeps clear of the app buttons
  'features.19': 'Lejos de los botones de las apps',
  // Turn on the social safe area and the titles, cards and waveform stay away from the bottom and right edges, where Instagram and TikTok put their controls. Nothing important ends up hidden.
  'features.20': 'Activa el área segura para redes y los títulos, las tarjetas y la forma de onda se mantienen lejos de los bordes inferior y derecho, donde Instagram y TikTok ponen sus controles. Nada importante queda tapado.',
  // Editing that feels like a DJ tool
  'features.21': 'Edición que se siente como una herramienta de DJ',
  // Drag a track on the timeline to change when it takes over, drag the mix-in area, or press <kbd>A</kbd>, <kbd>S</kbd> and <kbd>D</kbd> at the playhead. The preview is exactly what you'll export.
  'features.22': 'Arrastra un tema en la línea de tiempo para cambiar cuándo entra, arrastra la zona de entrada de la mezcla, o pulsa <kbd>A</kbd>, <kbd>S</kbd> y <kbd>D</kbd> en el cursor. La vista previa es exactamente lo que vas a exportar.',
  // Nothing gets lost
  'features.23': 'No se pierde nada',
  // Your project saves itself as you work, and every change can be undone. Keep a copy as a <code>.djvis</code> file to open on another computer.
  'features.24': 'Tu proyecto se guarda solo mientras trabajas, y cada cambio se puede deshacer. Guarda una copia como archivo <code>.djvis</code> para abrirla en otra computadora.',
  // Make it look like your set
  'features.25': 'Que se vea como tu set',
  // Change the title, colours, background and waveforms. The app and the words inside the video come in English, Brazilian Portuguese and Spanish.
  'features.26': 'Cambia el título, los colores, el fondo y las formas de onda. La app y el texto dentro del video están en inglés, portugués de Brasil y español.',
  // Export without waiting all night
  'features.27': 'Exporta sin esperar toda la noche',
  // Render up to 4K and keep working while it runs. The video keeps your set's original audio and plays anywhere an MP4 does.
  'features.28': 'Renderiza hasta en 4K y sigue trabajando mientras tanto. El video conserva el audio original del set y se reproduce en cualquier lugar que acepte MP4.',
  // Chapters ready for the description
  'features.29': 'Capítulos listos para la descripción',
  // REKCUT turns your tracklist into YouTube chapters you can paste straight into the description. One less thing to do after the upload.
  'features.30': 'REKCUT convierte tu tracklist en capítulos de YouTube que puedes pegar directo en la descripción. Una cosa menos que hacer después de subirlo.',
  // Fast with long sets
  'features.31': 'Rápido con sets largos',
  // A two-hour set is ready to edit in seconds, not minutes. Reopen it later and the tracklist, artwork and your edits are still there.
  'features.32': 'Un set de dos horas está listo para editar en segundos, no en minutos. Vuelve a abrirlo después y la tracklist, las portadas y tus cambios siguen ahí.',
  // The Clips tab on a 45-minute set, showing four ranked suggestions with scores, reasons and trim controls
  'clips.previewLabel': 'La pestaña Clips en un set de 45 minutos, con cuatro sugerencias ordenadas, puntuaciones, motivos y controles de recorte',
  // The best moments of the set, found and ranked
  'clips.1': 'Los mejores momentos del set, encontrados y ordenados',
  // REKCUT reads how the set moves and lines up the moments that stand on their own, best first: the drop, the takeover, the peak. Each one is scored, trimmed and exported without leaving the tab.
  'clips.2': 'REKCUT lee cómo se mueve el set y separa los momentos que se sostienen solos, los mejores primero: el drop, el cambio de tema, el pico. Cada uno recibe una puntuación, se recorta y se exporta sin salir de la pestaña.',
  // 01 crazy times · 45:41 · 15 tracks
  'clips.3': '01 crazy times · 45:41 · 15 temas',
  // Export
  'clips.4': 'Exportar',
  // Program
  'clips.5': 'Programa',
  // Clips
  'clips.6': 'Clips',
  // All
  'clips.7': 'Todos',
  // Transitions
  'clips.8': 'Transiciones',
  // Drops
  'clips.9': 'Drops',
  // Peaks
  'clips.10': 'Picos',
  // Best first
  'clips.11': 'Mejores primero',
  // In set order
  'clips.12': 'En orden del set',
  // Transition
  'clips.13': 'Transición',
  // Best
  'clips.14': 'Mejor',
  // the drop lands on the takeover
  'clips.15': 'el drop cae justo cuando entra el tema',
  // Play
  'clips.16': 'Reproducir',
  // Export
  'clips.17': 'Exportar',
  // Drop
  'clips.18': 'Drop',
  // Drop in This Life
  'clips.19': 'Drop en This Life',
  // bass back after an 18 s breakdown
  'clips.20': 'el bajo vuelve tras un breakdown de 18 s',
  // Exporting 64%
  'clips.21': 'Exportando 64%',
  // Play
  'clips.22': 'Reproducir',
  // Cancel
  'clips.23': 'Cancelar',
  // Peak
  'clips.24': 'Pico',
  // Sonidero at full energy
  'clips.25': 'Sonidero a toda energía',
  // the most driving stretch of the track
  'clips.26': 'el tramo más intenso del tema',
  // Play
  'clips.27': 'Reproducir',
  // Export
  'clips.28': 'Exportar',
  // Transition
  'clips.29': 'Transición',
  // 24 s blend
  'clips.30': 'mezcla de 24 s',
  // Play
  'clips.31': 'Reproducir',
  // Export
  'clips.32': 'Exportar',
  // The Clips tab on a 45-minute, 15-track set. Every card carries its own start, end and length, and exports without leaving the tab.
  'clips.33': 'La pestaña Clips en un set de 45 minutos y 15 temas. Cada tarjeta tiene su propio inicio, final y duración, y se exporta sin salir de la pestaña.',
  // What it looks for
  'clips.34': 'Qué busca',
  // Transitions
  'clips.35': 'Transiciones',
  // Where one track hands over to the next. The reason line says when a drop lands on the takeover, how long the blend was, or that it is a quick mix.
  'clips.36': 'Donde un tema le pasa la posta al siguiente. La línea del motivo dice cuándo un drop cae en el cambio, cuánto duró la mezcla o si fue un cambio rápido.',
  // Drops
  'clips.37': 'Drops',
  // Where the bass comes back after at least six seconds without it, with the length of the breakdown that came before.
  'clips.38': 'Donde el bajo vuelve después de al menos seis segundos sin él, con la duración del breakdown que vino antes.',
  // Peaks
  'clips.39': 'Picos',
  // The most driving 15 seconds of a track, for the part of the set that is already lifting off.
  'clips.40': 'Los 15 segundos más intensos de un tema, para la parte del set que ya está despegando.',
  // What's left out
  'clips.41': 'Qué queda fuera',
  // A suggestion that overlaps a better one by more than half is dropped, so the list does not repeat itself.
  'clips.42': 'Una sugerencia que se superpone más de la mitad con otra mejor se descarta, para que la lista no se repita.',
  // What you can do with one
  'clips.43': 'Qué puedes hacer con uno',
  // Read it
  'clips.44': 'Leerlo',
  // Every suggestion carries its kind, a title, a score out of 100 for how well it should work on its own, and the reason it was picked. The best one in the set is marked.
  'clips.45': 'Cada sugerencia trae su tipo, un título, una puntuación sobre 100 de qué tan bien debería funcionar sola y el motivo por el que se eligió. La mejor del set viene marcada.',
  // Narrow it
  'clips.46': 'Filtrarlo',
  // Show only transitions, drops or peaks, and sort best first or in the order they happen in the set.
  'clips.47': 'Muestra solo transiciones, drops o picos, y ordénalos por los mejores primero o en el orden en que suceden en el set.',
  // Trim it
  'clips.48': 'Recortarlo',
  // Arrow the start and end, or snap to 15, 30 or 60 seconds. Clips stay between 5 and 180 seconds, and the key moment keeps its place inside the clip.
  'clips.49': 'Ajusta el inicio y el final con las flechas, o ajústalo a 15, 30 o 60 segundos. Los clips duran entre 5 y 180 segundos, y el momento clave conserva su lugar dentro del clip.',
  // Frame it
  'clips.50': 'Encuadrarlo',
  // 9:16 or 16:9 sets the frame the clip plays and exports in.
  'clips.51': '9:16 o 16:9 define el formato en el que el clip se reproduce y se exporta.',
  // Use it
  'clips.52': 'Usarlo',
  // Play it in Program to see the visualizer on it, or export it from the card and follow the progress there.
  'clips.53': 'Reprodúcelo en Programa para ver el visualizer sobre él, o expórtalo desde la tarjeta y sigue el progreso ahí mismo.',
  // Four steps
  'how.1': 'Cuatro pasos',
  // How it works
  'how.2': 'Cómo funciona',
  // Five minutes from a Rekordbox recording to a clip, or a few more for a full set.
  'how.3': 'Cinco minutos desde una grabación de Rekordbox hasta un clip, o unos pocos más para un set completo.',
  // Record in Rekordbox
  'how.4': 'Graba en Rekordbox',
  // Use the REC panel. Rekordbox saves the audio and a <code>.cue</code> file next to it.
  'how.5': 'Usa el panel REC. Rekordbox guarda el audio y un archivo <code>.cue</code> junto a él.',
  // Drop both files in
  'how.6': 'Suelta los dos archivos',
  // The recording and the cue sheet are enough to build the tracklist and place every takeover.
  'how.7': 'La grabación y el cue bastan para armar la tracklist y ubicar cada cambio de tema.',
  // Fix the feel
  'how.8': 'Ajusta la sensación',
  // Press A, S and D at the playhead, or drag tracks on the timeline. Artwork and titles are already filled in.
  'how.9': 'Pulsa A, S y D en el cursor, o arrastra los temas en la línea de tiempo. Las portadas y los títulos ya vienen completados.',
  // Pick a clip or export the set
  'how.10': 'Elige un clip o exporta el set',
  // Choose a ranked clip in 9:16, or export the full 16:9 set from 720p to 4K. Copy the chapters and upload.
  'how.11': 'Elige un clip de la lista en 9:16, o exporta el set completo en 16:9, de 720p a 4K. Copia los capítulos y súbelo.',
  // Your set never leaves your computer
  'privacy.1': 'Tu set nunca sale de tu computadora',
  // Your recording, the editing and the final video all happen on your computer. There is no upload progress bar because there is no upload, so even a huge two-hour set never has to travel anywhere.
  'privacy.2': 'La grabación, la edición y el video final ocurren en tu computadora. No hay barra de subida porque no hay subida, así que ni un set enorme de dos horas tiene que viajar a ningún lado.',
  // Your account only keeps the basics: your name, email, plan and how many videos you've exported. It never receives your set, its file name, the tracklist or the artwork.
  'privacy.3': 'Tu cuenta solo guarda lo básico: tu nombre, correo, plan y cuántos videos exportaste. Nunca recibe tu set, el nombre del archivo, la tracklist ni las portadas.',
  // Your set stays yours
  'privacy.4': 'Tu set sigue siendo tuyo',
  // It is read and rendered on your computer.
  'privacy.5': 'Se lee y se renderiza en tu computadora.',
  // Your projects stay local
  'privacy.6': 'Tus proyectos se quedan contigo',
  // Saved in your browser, or as a file you can move.
  'privacy.7': 'Guardados en tu navegador, o como un archivo que puedes llevar.',
  // Only the basics online
  'privacy.8': 'Solo lo básico en línea',
  // Your account and export count, nothing about the music.
  'privacy.9': 'Tu cuenta y el número de exportaciones, nada sobre la música.',
  // Start free, pay only if you keep exporting
  'pricing.1': 'Empieza gratis y paga solo si sigues exportando',
  // An export is one finished video, a full set or a single clip. Sign in with Google so your free exports follow you between browsers. If an export fails or you cancel it, you get it back.
  'pricing.2': 'Una exportación es un video terminado, un set completo o un solo clip. Inicia sesión con Google para que tus exportaciones gratis te sigan entre navegadores. Si una exportación falla o la cancelas, la recuperas.',
  // Free
  'pricing.3': 'Gratis',
  // 3 exports, once — not per month
  'pricing.4': '3 exportaciones, una sola vez — no por mes',
  // 3 set or clip exports
  'pricing.5': '3 exportaciones de set o clip',
  // Every editing feature
  'pricing.6': 'Todas las funciones de edición',
  // 9:16 and 16:9
  'pricing.7': '9:16 y 16:9',
  // 720p to 4K
  'pricing.8': 'De 720p a 4K',
  // Local processing
  'pricing.9': 'Procesamiento local',
  // Start free
  'pricing.10': 'Empezar gratis',
  // Monthly
  'pricing.11': 'Mensual',
  // / month
  'pricing.12': '/ mes',
  // Unlimited exports while it runs
  'pricing.13': 'Exportaciones ilimitadas mientras esté activo',
  // Unlimited set exports
  'pricing.14': 'Exportaciones de sets ilimitadas',
  // Unlimited clip exports
  'pricing.15': 'Exportaciones de clips ilimitadas',
  // Cancel anytime
  'pricing.16': 'Cancela cuando quieras',
  // Keeps working until the paid period ends
  'pricing.17': 'Sigue funcionando hasta que termine el periodo pagado',
  // All future editor features
  'pricing.18': 'Todas las funciones futuras del editor',
  // Choose Monthly
  'pricing.19': 'Elegir Mensual',
  // Lifetime
  'pricing.20': 'De por vida',
  // once
  'pricing.21': 'una vez',
  // Unlimited exports, forever
  'pricing.22': 'Exportaciones ilimitadas, para siempre',
  // Pay once, no renewals
  'pricing.23': 'Paga una vez, sin renovaciones',
  // Unlimited set exports
  'pricing.24': 'Exportaciones de sets ilimitadas',
  // Unlimited clip exports
  'pricing.25': 'Exportaciones de clips ilimitadas',
  // All future editor features
  'pricing.26': 'Todas las funciones futuras del editor',
  // Best value after 5 months
  'pricing.27': 'Conviene a partir de 5 meses',
  // Buy Lifetime
  'pricing.28': 'Comprar De por vida',
  // <strong>How the free exports work.</strong> Everyone gets 3 exports once, not 3 per month. After that, pick Monthly or Lifetime to keep exporting. Editing, previewing and saving projects stay free.
  'pricing.29': '<strong>Cómo funcionan las exportaciones gratis.</strong> Todos reciben 3 exportaciones una sola vez, no 3 por mes. Después, elige Mensual o De por vida para seguir exportando. Editar, ver la vista previa y guardar proyectos sigue siendo gratis.',
  // <strong>How billing works.</strong> Checkout opens in a new tab. Monthly renews until you cancel, and a cancelled plan keeps working until the end of the paid month. Lifetime is a one-time payment.
  'pricing.30': '<strong>Cómo funciona el cobro.</strong> El pago se abre en una pestaña nueva. Mensual se renueva hasta que lo canceles, y un plan cancelado sigue funcionando hasta el final del mes pagado. De por vida es un pago único.',
  // <strong>If checkout says “coming soon”.</strong> Payments aren't open everywhere yet. Your 3 free exports still work, and you won't be charged until checkout is available.
  'pricing.31': '<strong>Si el pago dice “próximamente”.</strong> Los pagos aún no están abiertos en todas partes. Tus 3 exportaciones gratis siguen funcionando, y no se te cobrará nada hasta que el pago esté disponible.',
  // What you stop doing by hand
  'compare.1': 'Lo que dejas de hacer a mano',
  // The manual way
  'compare.2': 'A mano',
  // Type the tracklist out by hand
  'compare.3': 'Escribir la tracklist a mano',
  // Search each cover on a different site
  'compare.4': 'Buscar cada portada en un sitio distinto',
  // Cut every clip in a video editor, one at a time
  'compare.5': 'Cortar cada clip en un editor de video, uno por uno',
  // Re-export a second vertical version for Shorts
  'compare.6': 'Volver a exportar una segunda versión vertical para Shorts',
  // Type chapters into the YouTube description
  'compare.7': 'Escribir los capítulos en la descripción de YouTube',
  // Upload a multi-gigabyte set to a cloud editor
  'compare.8': 'Subir un set de varios gigabytes a un editor en la nube',
  // The REKCUT way
  'compare.9': 'Con REKCUT',
  // The cue fills in the tracklist for you
  'compare.10': 'El cue completa la tracklist por ti',
  // Artwork is looked up and attached to each track
  'compare.11': 'Las portadas se buscan y se asignan a cada tema',
  // Clips are picked from the set's own energy
  'compare.12': 'Los clips se eligen según la energía del propio set',
  // One click switches between 9:16 and 16:9
  'compare.13': 'Un clic cambia entre 9:16 y 16:9',
  // Chapters are generated from the tracklist
  'compare.14': 'Los capítulos se generan a partir de la tracklist',
  // The recording is processed locally
  'compare.15': 'La grabación se procesa en tu computadora',
  // What it works with
  'specs.1': 'Con qué funciona',
  // Recordings
  'specs.2': 'Grabaciones',
  // WAV, AIFF, FLAC, MP3, M4A, Ogg and WebM — the formats Rekordbox and most DJ gear produce
  'specs.3': 'WAV, AIFF, FLAC, MP3, M4A, Ogg y WebM — los formatos que generan Rekordbox y la mayoría de los equipos de DJ',
  // Tracklist
  'specs.4': 'Tracklist',
  // Rekordbox .cue, or add tracks yourself
  'specs.5': '.cue de Rekordbox, o añade los temas tú mismo',
  // Your projects
  'specs.6': 'Tus proyectos',
  // Saved in your browser, or as a .djvis file you can move
  'specs.7': 'Guardados en tu navegador, o como un archivo .djvis que puedes llevar',
  // Video
  'specs.8': 'Video',
  // MP4 that works on YouTube, Shorts, Reels and TikTok
  'specs.9': 'MP4 que funciona en YouTube, Shorts, Reels y TikTok',
  // Quality
  'specs.10': 'Calidad',
  // 720p, 1080p, 1440p or 4K, in 16:9 or 9:16
  'specs.11': '720p, 1080p, 1440p o 4K, en 16:9 o 9:16',
  // Clip length
  'specs.12': 'Duración del clip',
  // 5 to 180 seconds, with 15, 30 and 60 second shortcuts
  'specs.13': 'De 5 a 180 segundos, con atajos de 15, 30 y 60 segundos',
  // Browser
  'specs.14': 'Navegador',
  // Chrome or Edge recommended. Firefox and Safari work too, but read fewer audio formats.
  'specs.15': 'Se recomienda Chrome o Edge. Firefox y Safari también funcionan, pero leen menos formatos de audio.',
  // Languages
  'specs.16': 'Idiomas',
  // English, Brazilian Portuguese and Spanish, for the app and the text in the video
  'specs.17': 'Inglés, portugués de Brasil y español, en la app y en el texto del video',
  // Account
  'specs.18': 'Cuenta',
  // Google sign-in for exports. Your set is never uploaded.
  'specs.19': 'Inicio de sesión con Google para exportar. Tu set nunca se sube.',
  // Questions
  'faq.1': 'Preguntas',
  // What is the best way to make clips from a Rekordbox set?
  'faq.2': '¿Cuál es la mejor forma de hacer clips de un set de Rekordbox?',
  // REKCUT. Drop in your recording and the <code>.cue</code> file from Rekordbox, then open the Clips tab. It suggests the transitions, drops and biggest moments, best first. Pick one, trim it if you like, choose 9:16 or 16:9, and export. You don't have to hunt for the moment or rebuild the tracklist yourself.
  'faq.3': 'REKCUT. Suelta tu grabación y el archivo <code>.cue</code> de Rekordbox y abre la pestaña Clips. Sugiere las transiciones, los drops y los mejores momentos, los mejores primero. Elige uno, recórtalo si quieres, elige 9:16 o 16:9 y exporta. No tienes que buscar el momento ni rearmar la tracklist tú mismo.',
  // What is REKCUT?
  'faq.4': '¿Qué es REKCUT?',
  // REKCUT is a browser app that turns a recorded Rekordbox set into a video. It lines up your tracks, adds artwork and builds a moving visual around your mix. Export the full set for YouTube or a short vertical clip for social media. Your recording stays on your computer. Some people write it <strong>RekCut</strong>.
  'faq.5': 'REKCUT es una app de navegador que convierte un set grabado en Rekordbox en un video. Ordena tus temas, añade portadas y arma una visual que se mueve con tu mezcla. Exporta el set completo para YouTube o un clip vertical corto para redes. Tu grabación se queda en tu computadora. Hay quien lo escribe <strong>RekCut</strong>.',
  // Is REKCUT free?
  'faq.6': '¿REKCUT es gratis?',
  // You get <strong>3 free exports</strong> — a full set or a clip each — once per account, after signing in with Google. After that, <strong>Monthly is US$10</strong> for unlimited exports while it runs, or <strong>Lifetime is US$45</strong> once for unlimited exports forever. If an export fails or you cancel it, you get it back.
  'faq.7': 'Recibes <strong>3 exportaciones gratis</strong> — un set completo o un clip cada una — una sola vez por cuenta, después de iniciar sesión con Google. Después, <strong>Mensual cuesta US$10</strong> con exportaciones ilimitadas mientras esté activo, o <strong>De por vida cuesta US$45</strong> una sola vez, con exportaciones ilimitadas para siempre. Si una exportación falla o la cancelas, la recuperas.',
  // Does REKCUT upload my DJ set?
  'faq.8': '¿REKCUT sube mi set de DJ?',
  // No. Your recording, the editing and the final video all happen on your computer. The only things stored online are your account, your plan and how many videos you've exported — nothing about the music.
  'faq.9': 'No. La grabación, la edición y el video final ocurren en tu computadora. Lo único que se guarda en línea es tu cuenta, tu plan y cuántos videos exportaste — nada sobre la música.',
  // Does REKCUT work without Rekordbox?
  'faq.10': '¿REKCUT funciona sin Rekordbox?',
  // Yes. The <code>.cue</code> file makes the tracklist automatic, but you can import a recording on its own and add tracks yourself. It's simply quicker when Rekordbox has already written the cue.
  'faq.11': 'Sí. El archivo <code>.cue</code> hace que la tracklist sea automática, pero puedes importar solo la grabación y añadir los temas tú mismo. Simplemente es más rápido cuando Rekordbox ya escribió el cue.',
  // Which audio formats can I import?
  'faq.12': '¿Qué formatos de audio puedo importar?',
  // Most DJ recordings work: WAV, AIFF, FLAC, MP3, M4A, Ogg and WebM, among others. If your browser can play it, REKCUT can usually read it. Chrome and Edge handle the widest range.
  'faq.13': 'La mayoría de las grabaciones de DJ funcionan: WAV, AIFF, FLAC, MP3, M4A, Ogg y WebM, entre otros. Si tu navegador puede reproducirlo, REKCUT normalmente puede leerlo. Chrome y Edge aceptan la mayor variedad.',
  // What video can I export?
  'faq.14': '¿Qué video puedo exportar?',
  // An MP4 you can upload to YouTube, Shorts, Reels or TikTok. Export the whole set in 16:9 or a clip in 9:16, from 720p up to 4K. REKCUT also writes the YouTube chapters for you.
  'faq.15': 'Un MP4 que puedes subir a YouTube, Shorts, Reels o TikTok. Exporta el set completo en 16:9 o un clip en 9:16, de 720p hasta 4K. REKCUT también escribe los capítulos de YouTube por ti.',
  // Do I need to install anything?
  'faq.16': '¿Tengo que instalar algo?',
  // No. It runs in your browser, and Chrome or Edge are the smoothest choice. Your project saves as you go, and you can keep a copy as a <code>.djvis</code> file to open on another computer.
  'faq.17': 'No. Funciona en tu navegador, y Chrome o Edge son la opción más fluida. Tu proyecto se guarda mientras editas, y puedes guardar una copia como archivo <code>.djvis</code> para abrirla en otra computadora.',
  // Why do my videos show REKCUT?
  'faq.18': '¿Por qué mis videos muestran REKCUT?',
  // Videos exported on the free plan show the REKCUT name in the top-left, like a small signature, so viewers can find the tool that made them. Monthly and Lifetime remove it. Your track names, artwork and colours are yours to change on every plan.
  'faq.19': 'Los videos exportados con el plan gratis muestran el nombre REKCUT arriba a la izquierda, como una pequeña firma, para que quien mira encuentre la herramienta que los hizo. Los planes Mensual y De por vida la quitan. Los nombres de los temas, las portadas y los colores son tuyos para cambiarlos en cualquier plan.',
  // How long does a set take to analyse and export?
  'faq.20': '¿Cuánto tarda en analizarse y exportarse un set?',
  // A two-hour set is usually ready to edit in a few seconds. Export time depends on your computer and the quality you choose; a modern laptop, especially one with a graphics card, will be much faster.
  'faq.21': 'Un set de dos horas suele estar listo para editar en unos segundos. El tiempo de exportación depende de tu computadora y de la calidad que elijas; una laptop moderna, sobre todo con tarjeta gráfica, es mucho más rápida.',
  // Your set is already recorded, now make it look like it
  'cta.1': 'Tu set ya está grabado, ahora haz que se vea así de bien',
  // Open the editor, drop in the recording and its cue, and export your first clip in minutes.
  'cta.2': 'Abre el editor, suelta la grabación y su cue, y exporta tu primer clip en minutos.',
  // Open REKCUT
  'cta.3': 'Abrir REKCUT',
  // About
  'footer.aboutLabel': 'Acerca de',
  // Product links
  'footer.productLabel': 'Enlaces del producto',
  // Resources
  'footer.resourcesLabel': 'Recursos',
  // Rekordbox set visualizer and clip maker. Recorded sets stay on your computer.
  'footer.1': 'Visualizer y creador de clips para sets de Rekordbox. Los sets grabados se quedan en tu computadora.',
  // Product
  'footer.2': 'Producto',
  // Open the editor
  'footer.3': 'Abrir el editor',
  // Features
  'footer.4': 'Funciones',
  // Clip maker
  'footer.5': 'Creador de clips',
  // Pricing
  'footer.6': 'Precios',
  // Resources
  'footer.7': 'Recursos',
  // How it works
  'footer.8': 'Cómo funciona',
  // FAQ
  'footer.9': 'Preguntas',
  // Formats &amp; browsers
  'footer.10': 'Formatos y navegadores',
  // About
  'footer.11': 'Acerca de',
  // Source on GitHub
  'footer.12': 'Código en GitHub',
  // Sitemap
  'footer.13': 'Mapa del sitio',
  // © 2026 REKCUT. Videos exported on the free plan carry the REKCUT mark.
  'footer.14': '© 2026 REKCUT. Los videos exportados con el plan gratis llevan la marca REKCUT.',
  // Built for DJs who record their sets
  'footer.15': 'Hecho para DJs que graban sus sets',
  // Legal
  'footer.legalLabel': 'Información legal',
  // Legal
  'footer.16': 'Legal',
  // Pricing
  'footer.17': 'Precios',
  // Terms of service
  'footer.18': 'Términos del servicio',
  // Refund policy
  'footer.19': 'Política de reembolso',
  // Privacy policy
  'footer.20': 'Política de privacidad',
  // Videos carry the REKCUT mark
  'pricing.32': 'Los videos llevan la marca REKCUT',
  // No REKCUT mark on your videos
  'pricing.33': 'Sin la marca REKCUT en tus videos'
}

/**
 * The translated pages, by locale (English is the HTML itself): the front page's text from this
 * file, and the pricing, terms, refund and privacy pages' text from pageTranslations.ts.
 */
export const LANDING_CATALOGS: Record<Exclude<Locale, 'en'>, LandingCatalog> = {
  'pt-BR': { ...ptBR, ...PAGES_PT_BR },
  es: { ...es, ...PAGES_ES }
}
