/**
 * The pricing, terms, refund and privacy pages (src/web/*.html) in Brazilian Portuguese and Spanish,
 * merged into LANDING_CATALOGS by translations.ts. Same rules as there: each entry carries the
 * English it translates in a comment, change both translations when the English changes, and keep
 * the markup tags the same. `%legal.<field>%` tokens are filled from legal.ts after translation.
 */
import type { LandingCatalog } from './translations'


export const PAGES_PT_BR: LandingCatalog = {
  // Terms of service — REKCUT
  't.meta.title': 'Termos de uso — REKCUT',
  // The terms for using REKCUT, the browser app that turns a recorded Rekordbox set into a video: accounts, free exports, paid plans through Paddle, and your rights.
  't.meta.description': 'Os termos para usar o REKCUT, o app de navegador que transforma um set gravado no Rekordbox em vídeo: contas, exportações grátis, planos pagos pela Paddle e os seus direitos.',
  // Terms of service
  't.title': 'Termos de uso',
  // These terms are the agreement between you and REKCUT for using this site and the REKCUT editor. Please read them before you buy a plan.
  't.lede': 'Estes termos são o acordo entre você e o REKCUT para usar este site e o editor do REKCUT. Leia antes de comprar um plano.',
  // Last updated
  'legal.updated': 'Última atualização',
  // On this page
  'legal.toc': 'Nesta página',
  // Who we are
  't.h1': 'Quem somos',
  // The service
  't.h2': 'O serviço',
  // Your account
  't.h3': 'Sua conta',
  // Free exports and paid plans
  't.h4': 'Exportações grátis e planos pagos',
  // Payment
  't.h5': 'Pagamento',
  // Renewal and cancellation
  't.h6': 'Renovação e cancelamento',
  // Your music and your videos
  't.h7': 'Sua música e seus vídeos',
  // Acceptable use
  't.h8': 'Uso permitido',
  // Other services
  't.h9': 'Outros serviços',
  // Changes and availability
  't.h10': 'Mudanças e disponibilidade',
  // Ending your account
  't.h11': 'Encerrar a conta',
  // Liability
  't.h12': 'Responsabilidade',
  // Law
  't.h13': 'Lei aplicável',
  // Contact
  't.h14': 'Contato',
  // REKCUT is a browser app that turns a recorded DJ set into a video. It is run by the seller below ("REKCUT", "we", "us").
  't.1': 'O REKCUT é um app de navegador que transforma um set de DJ gravado em vídeo. Ele é mantido pelo vendedor abaixo ("REKCUT", "nós").',
  // Seller
  'legal.seller': 'Vendedor',
  // REKCUT runs in your browser. Your recording is analysed, and the video is rendered and encoded, on your own computer; the audio is never uploaded to us. The <a href="./">front page</a> and the <a href="./pricing.html">pricing page</a> describe what it does and what each plan includes. We may improve, change or remove features over time.
  't.2': 'O REKCUT roda no seu navegador. A gravação é analisada e o vídeo é desenhado e codificado no seu próprio computador; o áudio nunca é enviado para nós. A <a href="./">página inicial</a> e a <a href="./pricing.html">página de preços</a> descrevem o que ele faz e o que cada plano inclui. Podemos melhorar, mudar ou remover recursos com o tempo.',
  // Exporting needs a Google account. An account, its free exports and its plan are for one person: they can't be shared, sold or transferred. You are responsible for what happens under your account. You must be old enough to enter a contract where you live, or have a parent or guardian's permission.
  't.3': 'Para exportar é preciso uma conta Google. A conta, as exportações grátis e o plano são de uma pessoa só: não podem ser compartilhados, vendidos nem transferidos. Você é responsável pelo que acontece na sua conta. Você precisa ter idade para fazer um contrato onde mora, ou ter a permissão de um responsável.',
  // Every account gets 3 free exports, once. Monthly and Lifetime give unlimited exports and remove the REKCUT mark from your videos, as described on the <a href="./pricing.html">pricing page</a>. An export that fails, or that you cancel, gives its free export back.
  't.4': 'Toda conta ganha 3 exportações grátis, uma única vez. O Mensal e o Vitalício dão exportações ilimitadas e tiram a marca REKCUT dos seus vídeos, como descrito na <a href="./pricing.html">página de preços</a>. Uma exportação que falha, ou que você cancela, devolve a exportação grátis.',
  // Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns.
  't.5': 'Nossas vendas são feitas pela nossa revendedora online Paddle.com. A Paddle.com é a Merchant of Record (vendedora oficial) de todos os nossos pedidos. A Paddle atende todas as dúvidas sobre os pedidos e cuida das devoluções.',
  // The purchase is also covered by <a href="https://www.paddle.com/legal/checkout-buyer-terms">Paddle's buyer terms</a>. Prices are listed in US dollars on the pricing page, and taxes are added at checkout where they apply.
  't.6': 'A compra também segue os <a href="https://www.paddle.com/legal/checkout-buyer-terms">termos de compra da Paddle</a>. Os preços estão em dólares americanos na página de preços, e os impostos são somados no checkout quando se aplicam.',
  // Monthly renews automatically every month until you cancel. You can cancel at any time: the plan keeps working until the end of the month you paid for and isn't charged again. Lifetime is a single payment and never renews. Refunds follow the <a href="./refund.html">refund policy</a>.
  't.7': 'O Mensal é renovado automaticamente todo mês até você cancelar. Você pode cancelar quando quiser: o plano continua funcionando até o fim do mês pago e não é cobrado de novo. O Vitalício é um pagamento único e nunca é renovado. Os reembolsos seguem a <a href="./refund.html">política de reembolso</a>.',
  // You keep every right you have in your recordings, artwork and videos. REKCUT never receives your audio, so we don't host or publish your content. You are responsible for having the rights to the music, artwork and names you use, and for following the rules of the platforms where you publish a video.
  't.8': 'Você mantém todos os direitos que tem sobre suas gravações, capas e vídeos. O REKCUT nunca recebe o seu áudio, então não hospedamos nem publicamos o seu conteúdo. Você é responsável por ter os direitos das músicas, capas e nomes que usa, e por seguir as regras das plataformas onde publica um vídeo.',
  // When you use REKCUT, please don't:
  't.9': 'Ao usar o REKCUT, não:',
  // try to get around the export limits, the export tickets or the REKCUT mark on free exports;
  't.10': 'tente burlar o limite de exportações, os tickets de exportação ou a marca REKCUT das exportações grátis;',
  // interfere with REKCUT's servers, or use bots or scripts to abuse them;
  't.11': 'interfira nos servidores do REKCUT nem use robôs ou scripts para abusar deles;',
  // use REKCUT to break the law or to infringe anyone's copyright or other rights.
  't.12': 'use o REKCUT para descumprir a lei ou violar direitos autorais ou outros direitos de alguém.',
  // Sign-in uses Google. Artwork and track details are looked up from Deezer, Apple Music and YouTube, and their own terms apply to their content. REKCUT is not affiliated with AlphaTheta, Pioneer DJ, rekordbox, YouTube, Instagram or TikTok.
  't.13': 'O login usa o Google. As capas e os dados das faixas são buscados no Deezer, no Apple Music e no YouTube, e os termos de cada um valem para o conteúdo deles. O REKCUT não tem ligação com AlphaTheta, Pioneer DJ, rekordbox, YouTube, Instagram nem TikTok.',
  // We work to keep REKCUT running, but we can't promise it will always be available or free of errors. Projects are saved in your browser, so keep a <code>.djvis</code> copy of the ones that matter. If we change these terms in a way that matters, we'll update the date at the top and tell paying customers by email before the change applies.
  't.14': 'Trabalhamos para manter o REKCUT funcionando, mas não podemos prometer que ele estará sempre disponível ou sem erros. Os projetos ficam salvos no seu navegador, então guarde uma cópia <code>.djvis</code> dos que importam. Se mudarmos estes termos de um jeito relevante, atualizamos a data no topo e avisamos quem paga por e-mail antes de a mudança valer.',
  // You can stop using REKCUT at any time and ask us to delete your account. We may suspend or close an account that seriously or repeatedly breaks these terms.
  't.15': 'Você pode parar de usar o REKCUT quando quiser e pedir para apagarmos a sua conta. Podemos suspender ou encerrar uma conta que descumpra estes termos de forma grave ou repetida.',
  // REKCUT is provided as it is. As far as the law allows, we aren't liable for indirect losses, lost data or lost profits, and our total liability is limited to what you paid us in the 12 months before the claim. Nothing here limits rights you have as a consumer that the law where you live doesn't let anyone take away.
  't.16': 'O REKCUT é oferecido como está. Na medida em que a lei permite, não respondemos por perdas indiretas, perda de dados ou lucros cessantes, e a nossa responsabilidade total se limita ao que você nos pagou nos 12 meses anteriores à reclamação. Nada aqui limita direitos de consumidor que a lei do lugar onde você mora não deixa ninguém tirar.',
  // These terms are governed by the laws of Brazil. If you are a consumer, you also keep the protection of the mandatory laws of the country where you live, and you can bring a claim in its courts.
  't.17': 'Estes termos seguem as leis do Brasil. Se você é consumidor, também mantém a proteção das leis obrigatórias do país onde mora e pode entrar com uma reclamação na justiça de lá.',
  // Questions about these terms: <a href="mailto:%legal.email%">%legal.email%</a>.
  't.18': 'Dúvidas sobre estes termos: <a href="mailto:%legal.email%">%legal.email%</a>.',
  // Refund policy — REKCUT
  'r.meta.title': 'Política de reembolso — REKCUT',
  // Any REKCUT payment can be refunded within %legal.refundDays% days, no questions asked. How to ask, and what happens to your plan.
  'r.meta.description': 'Qualquer pagamento do REKCUT pode ser reembolsado em até %legal.refundDays% dias, sem perguntas. Como pedir e o que acontece com o seu plano.',
  // Refund policy
  'r.title': 'Política de reembolso',
  // If REKCUT isn't right for you, any payment can be refunded within %legal.refundDays% days, no questions asked.
  'r.lede': 'Se o REKCUT não for para você, qualquer pagamento pode ser reembolsado em até %legal.refundDays% dias, sem perguntas.',
  // Refunds within %legal.refundDays% days
  'r.h1': 'Reembolso em até %legal.refundDays% dias',
  // How to ask
  'r.h2': 'Como pedir',
  // After a refund
  'r.h3': 'Depois do reembolso',
  // Cancelling Monthly
  'r.h4': 'Cancelar o Mensal',
  // Free exports
  'r.h5': 'Exportações grátis',
  // After %legal.refundDays% days
  'r.h6': 'Depois de %legal.refundDays% dias',
  // Ask within %legal.refundDays% days of a payment and you get the full amount back. This covers a Lifetime purchase, your first Monthly payment and every Monthly renewal.
  'r.1': 'Peça em até %legal.refundDays% dias depois de um pagamento e você recebe o valor inteiro de volta. Isso vale para a compra do Vitalício, o primeiro pagamento do Mensal e cada renovação do Mensal.',
  // Reply to the receipt email from Paddle, or look up your order at <a href="https://paddle.net">paddle.net</a> and request the refund there. You can also write to <a href="mailto:%legal.email%">%legal.email%</a> from the email address you bought with.
  'r.2': 'Responda o e-mail de recibo da Paddle, ou encontre o seu pedido em <a href="https://paddle.net">paddle.net</a> e peça o reembolso por lá. Você também pode escrever para <a href="mailto:%legal.email%">%legal.email%</a> usando o e-mail da compra.',
  // Paddle.com is the Merchant of Record for all our orders and makes the refund to the payment method you used. It usually shows up within 5 to 10 business days, depending on your bank.
  'r.3': 'A Paddle.com é a Merchant of Record (vendedora oficial) de todos os nossos pedidos e faz o reembolso no mesmo meio de pagamento que você usou. Ele costuma aparecer em 5 a 10 dias úteis, dependendo do seu banco.',
  // The refunded plan ends when the refund is made. New exports then use any free exports you have left and carry the REKCUT mark. Videos you already exported stay yours.
  'r.4': 'O plano reembolsado termina quando o reembolso é feito. As próximas exportações passam a usar as exportações grátis que sobraram e levam a marca REKCUT. Os vídeos que você já exportou continuam seus.',
  // Cancelling stops future renewals, and the plan keeps working until the end of the month you paid for. Cancelling doesn't refund that month by itself, but if its payment is less than %legal.refundDays% days old you can ask for it back as above.
  'r.5': 'Cancelar interrompe as próximas renovações, e o plano continua funcionando até o fim do mês pago. Cancelar não reembolsa esse mês sozinho, mas se o pagamento dele tiver menos de %legal.refundDays% dias você pode pedir o valor de volta como explicado acima.',
  // Free exports cost nothing, so there is nothing to refund. An export that fails, or that you cancel, gives its free export back on its own.
  'r.6': 'As exportações grátis não custam nada, então não há o que reembolsar. Uma exportação que falha, ou que você cancela, devolve a exportação grátis sozinha.',
  // Payments older than %legal.refundDays% days aren't refunded, except where the law requires it. If something isn't working, write to us first: we would rather fix it.
  'r.7': 'Pagamentos com mais de %legal.refundDays% dias não são reembolsados, a não ser quando a lei exige. Se algo não estiver funcionando, escreva para nós antes: preferimos resolver.',
  // This policy never takes away rights you have under consumer law, such as the right of withdrawal in Brazil's Consumer Protection Code (article 49) or in the European Union.
  'r.8': 'Esta política nunca tira direitos que você tem pela lei do consumidor, como o direito de arrependimento do Código de Defesa do Consumidor (artigo 49) ou o da União Europeia.',
  // Privacy policy — REKCUT
  'pv.meta.title': 'Política de privacidade — REKCUT',
  // REKCUT never receives your recordings or projects. What little personal data it keeps for sign-in and exports, why, and how to have it deleted.
  'pv.meta.description': 'O REKCUT nunca recebe suas gravações nem seus projetos. Os poucos dados pessoais que ele guarda para o login e as exportações, por quê, e como pedir para apagar.',
  // Privacy policy
  'pv.title': 'Política de privacidade',
  // REKCUT is built so your music never leaves your computer. This page explains the little we do collect, why, and what you can ask us to do with it.
  'pv.lede': 'O REKCUT foi feito para a sua música nunca sair do seu computador. Esta página explica o pouco que coletamos, por quê, e o que você pode pedir para fazermos com isso.',
  // Who is responsible
  'pv.h1': 'Quem é o responsável',
  // What never reaches us
  'pv.h2': 'O que nunca chega até nós',
  // What we collect
  'pv.h3': 'O que coletamos',
  // Why we use it
  'pv.h4': 'Para que usamos',
  // Who we share it with
  'pv.h5': 'Com quem compartilhamos',
  // Stored in your browser
  'pv.h6': 'Guardado no seu navegador',
  // How long we keep it
  'pv.h7': 'Por quanto tempo guardamos',
  // Your rights
  'pv.h8': 'Seus direitos',
  // Children
  'pv.h9': 'Crianças',
  // Changes
  'pv.h10': 'Mudanças',
  // %legal.name% is responsible for the personal data described here. For anything about your data, write to <a href="mailto:%legal.email%">%legal.email%</a>.
  'pv.1': '%legal.name% é o controlador dos dados pessoais descritos aqui. Para qualquer assunto sobre os seus dados, escreva para <a href="mailto:%legal.email%">%legal.email%</a>.',
  // Your recordings, cue sheets, tracklists, file names, artwork, projects and videos. Analysis, rendering and encoding happen in your browser, and projects are saved in your browser or in the <code>.djvis</code> files you keep.
  'pv.2': 'Suas gravações, arquivos cue, tracklists, nomes de arquivo, capas, projetos e vídeos. A análise, o desenho e a codificação acontecem no seu navegador, e os projetos ficam salvos no navegador ou nos arquivos <code>.djvis</code> que você guarda.',
  // <strong>Your Google account</strong>, when you sign in: your name, email address, profile picture and account id, through Firebase Authentication.
  'pv.3': '<strong>Sua conta Google</strong>, quando você entra: nome, e-mail, foto de perfil e o identificador da conta, pelo Firebase Authentication.',
  // <strong>Your plan and exports</strong>: how many free exports you have used, your plan, and for each export its time, whether it was a set or a clip, and whether it was free. No file names or set details.
  'pv.4': '<strong>Seu plano e suas exportações</strong>: quantas exportações grátis você usou, o seu plano e, para cada exportação, o horário, se foi um set ou um clipe e se foi grátis. Nenhum nome de arquivo nem detalhe do set.',
  // <strong>Payments</strong>: Paddle collects your payment details and billing address. We receive only a customer id, the plan you bought and its status.
  'pv.5': '<strong>Pagamentos</strong>: a Paddle coleta os dados do pagamento e o endereço de cobrança. Nós recebemos só um identificador de cliente, o plano comprado e a situação dele.',
  // <strong>Artwork searches</strong>: to find artwork, your browser sends a track's artist and title to Deezer and Apple Music, and, when you are signed in, to YouTube through our server. We don't keep these searches.
  'pv.6': '<strong>Busca de capas</strong>: para achar as capas, o seu navegador envia o artista e o título da faixa ao Deezer e ao Apple Music e, quando você está logado, ao YouTube pelo nosso servidor. Não guardamos essas buscas.',
  // <strong>Technical logs</strong>: our hosting provider records requests, such as IP address, browser and time, to keep the service secure. These logs are deleted after a limited time.
  'pv.7': '<strong>Registros técnicos</strong>: o nosso provedor de hospedagem registra os acessos, como endereço IP, navegador e horário, para manter o serviço seguro. Esses registros são apagados depois de um tempo limitado.',
  // To sign you in, count your exports, give you the plan you paid for, stop abuse of the free exports, answer your messages, and meet our legal and tax duties. The legal bases are the contract with you, our legitimate interest in keeping REKCUT secure, and legal obligations.
  'pv.8': 'Para fazer o seu login, contar as suas exportações, liberar o plano que você pagou, evitar abuso das exportações grátis, responder as suas mensagens e cumprir obrigações legais e fiscais. As bases legais são a execução do contrato com você, o nosso legítimo interesse em manter o REKCUT seguro e o cumprimento de obrigação legal.',
  // Google Cloud and Firebase, for hosting, sign-in and our database (in the São Paulo region), and Paddle, which handles payments as Merchant of Record. Artwork searches go to Deezer, Apple and YouTube as described above. Some of these providers process data outside your country under their own safeguards. We don't sell personal data, and we don't use advertising or analytics trackers.
  'pv.9': 'Google Cloud e Firebase, para hospedagem, login e o nosso banco de dados (na região de São Paulo), e a Paddle, que cuida dos pagamentos como Merchant of Record. As buscas de capas vão para o Deezer, a Apple e o YouTube, como descrito acima. Alguns desses fornecedores tratam dados fora do seu país, com as suas próprias garantias. Não vendemos dados pessoais e não usamos rastreadores de publicidade nem de análise.',
  // The editor keeps your projects, settings, file permissions and analysis results in your browser's storage, and Firebase keeps you signed in there. This stays on your device, and clearing the site's data removes it. We don't use cookies for advertising or tracking.
  'pv.10': 'O editor guarda seus projetos, configurações, permissões de arquivo e resultados de análise no armazenamento do navegador, e o Firebase mantém o seu login ali. Isso fica no seu aparelho, e limpar os dados do site apaga tudo. Não usamos cookies de publicidade nem de rastreamento.',
  // Account and export records are kept while your account exists. Payment records are kept for as long as tax law requires. When you ask us to delete your account, we delete its sign-in and export records within 30 days.
  'pv.11': 'Os dados da conta e das exportações ficam guardados enquanto a conta existir. Os registros de pagamento ficam pelo tempo que a lei fiscal exige. Quando você pede para apagarmos a sua conta, apagamos o login e os registros de exportação em até 30 dias.',
  // Under Brazil's LGPD, the GDPR and similar laws, you can ask to see, correct, export or delete your data, or object to how we use it. Write to <a href="mailto:%legal.email%">%legal.email%</a>. You can also complain to your data protection authority; in Brazil that is the ANPD.
  'pv.12': 'Pela LGPD, pelo GDPR e por leis parecidas, você pode pedir para ver, corrigir, levar ou apagar os seus dados, ou se opor ao uso que fazemos deles. Escreva para <a href="mailto:%legal.email%">%legal.email%</a>. Você também pode reclamar à autoridade de proteção de dados; no Brasil, é a ANPD.',
  // REKCUT isn't meant for children under 13, and we don't knowingly collect their data.
  'pv.13': 'O REKCUT não é feito para crianças com menos de 13 anos, e não coletamos dados delas de propósito.',
  // When this policy changes we update the date at the top. If a change matters, we tell signed-in users before it applies.
  'pv.14': 'Quando esta política muda, atualizamos a data no topo. Se a mudança for relevante, avisamos quem tem conta antes de ela valer.',
  // Pricing — REKCUT
  'pp.meta.title': 'Preços — REKCUT',
  // REKCUT pricing: 3 free exports, then US$10 a month or US$45 once for unlimited exports without the REKCUT mark. Payments are handled by Paddle.
  'pp.meta.description': 'Preços do REKCUT: 3 exportações grátis, depois US$ 10 por mês ou US$ 45 uma vez para exportar sem limite e sem a marca REKCUT. Os pagamentos são feitos pela Paddle.',
  // Pricing
  'pp.title': 'Preços',
  // Edit, preview and save projects for free, as much as you like. You only pay to keep exporting once your 3 free exports are used.
  'pp.lede': 'Edite, assista à prévia e salve projetos de graça, quanto quiser. Você só paga para continuar exportando depois de usar as 3 exportações grátis.',
  // What an export is
  'pp.h1': 'O que é uma exportação',
  // Prices, currency and taxes
  'pp.h2': 'Preços, moeda e impostos',
  // Who processes your payment
  'pp.h3': 'Quem processa o seu pagamento',
  // Cancelling and refunds
  'pp.h4': 'Cancelamento e reembolso',
  // Lifetime
  'pp.h5': 'Vitalício',
  // An export is one finished MP4: a full set or a single clip, at any size from 720p to 4K. If an export fails or you cancel it before it finishes, it doesn't count.
  'pp.1': 'Uma exportação é um MP4 pronto: um set inteiro ou um clipe, em qualquer tamanho de 720p a 4K. Se a exportação falhar ou você cancelar antes de terminar, ela não conta.',
  // Prices are in US dollars. Checkout may show the price in your local currency, and adds sales tax or VAT where the law requires it. You see the total before you pay.
  'pp.2': 'Os preços estão em dólares americanos. O checkout pode mostrar o valor na sua moeda local e soma os impostos que a lei exigir no seu país. Você vê o total antes de pagar.',
  // Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders: it takes the payment, sends the receipt or invoice, and handles billing questions and refunds. Your payment details go to Paddle and never reach REKCUT.
  'pp.3': 'Nossas vendas são feitas pela nossa revendedora online Paddle.com. A Paddle.com é a Merchant of Record (vendedora oficial) de todos os nossos pedidos: ela recebe o pagamento, envia o recibo ou a nota e cuida das dúvidas de cobrança e dos reembolsos. Os dados do seu pagamento vão para a Paddle e nunca chegam ao REKCUT.',
  // Cancel Monthly at any time from Account ▸ Manage plan in the editor, or from the link in your Paddle receipt. It keeps working until the end of the month you paid for. Any payment can be refunded within %legal.refundDays% days: see the <a href="./refund.html">refund policy</a>.
  'pp.4': 'Cancele o Mensal quando quiser em Conta ▸ Gerenciar plano, no editor, ou pelo link no recibo da Paddle. Ele continua funcionando até o fim do mês pago. Qualquer pagamento pode ser reembolsado em até %legal.refundDays% dias: veja a <a href="./refund.html">política de reembolso</a>.',
  // Lifetime is one payment for unlimited exports without the REKCUT mark, on the account that bought it, for as long as REKCUT is offered. It includes future editor features and never renews.
  'pp.5': 'O Vitalício é um único pagamento para exportar sem limite e sem a marca REKCUT, na conta que comprou, enquanto o REKCUT existir. Ele inclui os recursos futuros do editor e nunca é renovado.',
  // Buying a plan means you agree to the <a href="./terms.html">terms of service</a>. Read how we handle your data in the <a href="./privacy.html">privacy policy</a>.
  'pp.6': 'Ao comprar um plano você concorda com os <a href="./terms.html">termos de uso</a>. Veja como tratamos seus dados na <a href="./privacy.html">política de privacidade</a>.'
}


export const PAGES_ES: LandingCatalog = {
  // Terms of service — REKCUT
  't.meta.title': 'Términos del servicio — REKCUT',
  // The terms for using REKCUT, the browser app that turns a recorded Rekordbox set into a video: accounts, free exports, paid plans through Paddle, and your rights.
  't.meta.description': 'Los términos para usar REKCUT, la app de navegador que convierte un set grabado en Rekordbox en un video: cuentas, exportaciones gratis, planes de pago con Paddle y tus derechos.',
  // Terms of service
  't.title': 'Términos del servicio',
  // These terms are the agreement between you and REKCUT for using this site and the REKCUT editor. Please read them before you buy a plan.
  't.lede': 'Estos términos son el acuerdo entre tú y REKCUT para usar este sitio y el editor de REKCUT. Léelos antes de comprar un plan.',
  // Last updated
  'legal.updated': 'Última actualización',
  // On this page
  'legal.toc': 'En esta página',
  // Who we are
  't.h1': 'Quiénes somos',
  // The service
  't.h2': 'El servicio',
  // Your account
  't.h3': 'Tu cuenta',
  // Free exports and paid plans
  't.h4': 'Exportaciones gratis y planes de pago',
  // Payment
  't.h5': 'Pago',
  // Renewal and cancellation
  't.h6': 'Renovación y cancelación',
  // Your music and your videos
  't.h7': 'Tu música y tus videos',
  // Acceptable use
  't.h8': 'Uso aceptable',
  // Other services
  't.h9': 'Otros servicios',
  // Changes and availability
  't.h10': 'Cambios y disponibilidad',
  // Ending your account
  't.h11': 'Cerrar tu cuenta',
  // Liability
  't.h12': 'Responsabilidad',
  // Law
  't.h13': 'Ley aplicable',
  // Contact
  't.h14': 'Contacto',
  // REKCUT is a browser app that turns a recorded DJ set into a video. It is run by the seller below ("REKCUT", "we", "us").
  't.1': 'REKCUT es una app de navegador que convierte un set de DJ grabado en un video. La gestiona el vendedor indicado abajo ("REKCUT", "nosotros").',
  // Seller
  'legal.seller': 'Vendedor',
  // REKCUT runs in your browser. Your recording is analysed, and the video is rendered and encoded, on your own computer; the audio is never uploaded to us. The <a href="./">front page</a> and the <a href="./pricing.html">pricing page</a> describe what it does and what each plan includes. We may improve, change or remove features over time.
  't.2': 'REKCUT funciona en tu navegador. La grabación se analiza y el video se dibuja y codifica en tu propia computadora; el audio nunca se nos envía. La <a href="./">página principal</a> y la <a href="./pricing.html">página de precios</a> describen lo que hace y lo que incluye cada plan. Podemos mejorar, cambiar o quitar funciones con el tiempo.',
  // Exporting needs a Google account. An account, its free exports and its plan are for one person: they can't be shared, sold or transferred. You are responsible for what happens under your account. You must be old enough to enter a contract where you live, or have a parent or guardian's permission.
  't.3': 'Para exportar necesitas una cuenta de Google. La cuenta, sus exportaciones gratis y su plan son de una sola persona: no se pueden compartir, vender ni transferir. Eres responsable de lo que pase en tu cuenta. Debes tener edad para firmar un contrato donde vives, o el permiso de tu madre, padre o tutor.',
  // Every account gets 3 free exports, once. Monthly and Lifetime give unlimited exports and remove the REKCUT mark from your videos, as described on the <a href="./pricing.html">pricing page</a>. An export that fails, or that you cancel, gives its free export back.
  't.4': 'Cada cuenta recibe 3 exportaciones gratis, una sola vez. Mensual y De por vida dan exportaciones ilimitadas y quitan la marca REKCUT de tus videos, como se describe en la <a href="./pricing.html">página de precios</a>. Una exportación que falla, o que cancelas, devuelve su exportación gratis.',
  // Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns.
  't.5': 'Nuestro proceso de compra lo realiza nuestro revendedor online Paddle.com. Paddle.com es el Merchant of Record (vendedor oficial) de todos nuestros pedidos. Paddle atiende todas las consultas sobre los pedidos y gestiona las devoluciones.',
  // The purchase is also covered by <a href="https://www.paddle.com/legal/checkout-buyer-terms">Paddle's buyer terms</a>. Prices are listed in US dollars on the pricing page, and taxes are added at checkout where they apply.
  't.6': 'La compra también se rige por los <a href="https://www.paddle.com/legal/checkout-buyer-terms">términos de compra de Paddle</a>. Los precios figuran en dólares estadounidenses en la página de precios, y los impuestos se suman en el checkout cuando corresponden.',
  // Monthly renews automatically every month until you cancel. You can cancel at any time: the plan keeps working until the end of the month you paid for and isn't charged again. Lifetime is a single payment and never renews. Refunds follow the <a href="./refund.html">refund policy</a>.
  't.7': 'Mensual se renueva automáticamente cada mes hasta que lo canceles. Puedes cancelar cuando quieras: el plan sigue funcionando hasta el final del mes pagado y no se vuelve a cobrar. De por vida es un pago único y nunca se renueva. Los reembolsos siguen la <a href="./refund.html">política de reembolso</a>.',
  // You keep every right you have in your recordings, artwork and videos. REKCUT never receives your audio, so we don't host or publish your content. You are responsible for having the rights to the music, artwork and names you use, and for following the rules of the platforms where you publish a video.
  't.8': 'Conservas todos los derechos que tienes sobre tus grabaciones, portadas y videos. REKCUT nunca recibe tu audio, así que no alojamos ni publicamos tu contenido. Eres responsable de tener los derechos de la música, las portadas y los nombres que usas, y de seguir las reglas de las plataformas donde publicas un video.',
  // When you use REKCUT, please don't:
  't.9': 'Al usar REKCUT, no:',
  // try to get around the export limits, the export tickets or the REKCUT mark on free exports;
  't.10': 'intentes saltarte el límite de exportaciones, los tickets de exportación o la marca REKCUT de las exportaciones gratis;',
  // interfere with REKCUT's servers, or use bots or scripts to abuse them;
  't.11': 'interfieras con los servidores de REKCUT ni uses bots o scripts para abusar de ellos;',
  // use REKCUT to break the law or to infringe anyone's copyright or other rights.
  't.12': 'uses REKCUT para infringir la ley o los derechos de autor u otros derechos de nadie.',
  // Sign-in uses Google. Artwork and track details are looked up from Deezer, Apple Music and YouTube, and their own terms apply to their content. REKCUT is not affiliated with AlphaTheta, Pioneer DJ, rekordbox, YouTube, Instagram or TikTok.
  't.13': 'El inicio de sesión usa Google. Las portadas y los datos de los temas se buscan en Deezer, Apple Music y YouTube, y sus propios términos rigen su contenido. REKCUT no está afiliado a AlphaTheta, Pioneer DJ, rekordbox, YouTube, Instagram ni TikTok.',
  // We work to keep REKCUT running, but we can't promise it will always be available or free of errors. Projects are saved in your browser, so keep a <code>.djvis</code> copy of the ones that matter. If we change these terms in a way that matters, we'll update the date at the top and tell paying customers by email before the change applies.
  't.14': 'Trabajamos para mantener REKCUT en marcha, pero no podemos prometer que siempre esté disponible o sin errores. Los proyectos se guardan en tu navegador, así que guarda una copia <code>.djvis</code> de los que importan. Si cambiamos estos términos de forma relevante, actualizaremos la fecha de arriba y avisaremos por correo a quienes pagan antes de que el cambio se aplique.',
  // You can stop using REKCUT at any time and ask us to delete your account. We may suspend or close an account that seriously or repeatedly breaks these terms.
  't.15': 'Puedes dejar de usar REKCUT cuando quieras y pedirnos que borremos tu cuenta. Podemos suspender o cerrar una cuenta que incumpla estos términos de forma grave o repetida.',
  // REKCUT is provided as it is. As far as the law allows, we aren't liable for indirect losses, lost data or lost profits, and our total liability is limited to what you paid us in the 12 months before the claim. Nothing here limits rights you have as a consumer that the law where you live doesn't let anyone take away.
  't.16': 'REKCUT se ofrece tal cual. En la medida en que la ley lo permite, no respondemos por pérdidas indirectas, pérdida de datos ni lucro cesante, y nuestra responsabilidad total se limita a lo que nos pagaste en los 12 meses anteriores al reclamo. Nada de esto limita derechos de consumidor que la ley de donde vives no permite quitar.',
  // These terms are governed by the laws of Brazil. If you are a consumer, you also keep the protection of the mandatory laws of the country where you live, and you can bring a claim in its courts.
  't.17': 'Estos términos se rigen por las leyes de Brasil. Si eres consumidor, también conservas la protección de las leyes obligatorias del país donde vives y puedes presentar un reclamo ante sus tribunales.',
  // Questions about these terms: <a href="mailto:%legal.email%">%legal.email%</a>.
  't.18': 'Preguntas sobre estos términos: <a href="mailto:%legal.email%">%legal.email%</a>.',
  // Refund policy — REKCUT
  'r.meta.title': 'Política de reembolso — REKCUT',
  // Any REKCUT payment can be refunded within %legal.refundDays% days, no questions asked. How to ask, and what happens to your plan.
  'r.meta.description': 'Cualquier pago de REKCUT se puede reembolsar dentro de los %legal.refundDays% días, sin preguntas. Cómo pedirlo y qué pasa con tu plan.',
  // Refund policy
  'r.title': 'Política de reembolso',
  // If REKCUT isn't right for you, any payment can be refunded within %legal.refundDays% days, no questions asked.
  'r.lede': 'Si REKCUT no es para ti, cualquier pago se puede reembolsar dentro de los %legal.refundDays% días, sin preguntas.',
  // Refunds within %legal.refundDays% days
  'r.h1': 'Reembolso dentro de los %legal.refundDays% días',
  // How to ask
  'r.h2': 'Cómo pedirlo',
  // After a refund
  'r.h3': 'Después del reembolso',
  // Cancelling Monthly
  'r.h4': 'Cancelar Mensual',
  // Free exports
  'r.h5': 'Exportaciones gratis',
  // After %legal.refundDays% days
  'r.h6': 'Después de %legal.refundDays% días',
  // Ask within %legal.refundDays% days of a payment and you get the full amount back. This covers a Lifetime purchase, your first Monthly payment and every Monthly renewal.
  'r.1': 'Pídelo dentro de los %legal.refundDays% días posteriores a un pago y te devolvemos el importe completo. Esto vale para la compra De por vida, el primer pago de Mensual y cada renovación de Mensual.',
  // Reply to the receipt email from Paddle, or look up your order at <a href="https://paddle.net">paddle.net</a> and request the refund there. You can also write to <a href="mailto:%legal.email%">%legal.email%</a> from the email address you bought with.
  'r.2': 'Responde al correo del recibo de Paddle, o busca tu pedido en <a href="https://paddle.net">paddle.net</a> y pide el reembolso allí. También puedes escribir a <a href="mailto:%legal.email%">%legal.email%</a> desde el correo con el que compraste.',
  // Paddle.com is the Merchant of Record for all our orders and makes the refund to the payment method you used. It usually shows up within 5 to 10 business days, depending on your bank.
  'r.3': 'Paddle.com es el Merchant of Record (vendedor oficial) de todos nuestros pedidos y hace el reembolso al mismo medio de pago que usaste. Suele aparecer en 5 a 10 días hábiles, según tu banco.',
  // The refunded plan ends when the refund is made. New exports then use any free exports you have left and carry the REKCUT mark. Videos you already exported stay yours.
  'r.4': 'El plan reembolsado termina cuando se hace el reembolso. Las siguientes exportaciones usan las exportaciones gratis que te queden y llevan la marca REKCUT. Los videos que ya exportaste siguen siendo tuyos.',
  // Cancelling stops future renewals, and the plan keeps working until the end of the month you paid for. Cancelling doesn't refund that month by itself, but if its payment is less than %legal.refundDays% days old you can ask for it back as above.
  'r.5': 'Cancelar detiene las próximas renovaciones, y el plan sigue funcionando hasta el final del mes pagado. Cancelar no reembolsa ese mes por sí solo, pero si su pago tiene menos de %legal.refundDays% días puedes pedirlo de vuelta como se explica arriba.',
  // Free exports cost nothing, so there is nothing to refund. An export that fails, or that you cancel, gives its free export back on its own.
  'r.6': 'Las exportaciones gratis no cuestan nada, así que no hay nada que reembolsar. Una exportación que falla, o que cancelas, devuelve su exportación gratis por sí sola.',
  // Payments older than %legal.refundDays% days aren't refunded, except where the law requires it. If something isn't working, write to us first: we would rather fix it.
  'r.7': 'Los pagos de más de %legal.refundDays% días no se reembolsan, salvo cuando la ley lo exige. Si algo no funciona, escríbenos primero: preferimos arreglarlo.',
  // This policy never takes away rights you have under consumer law, such as the right of withdrawal in Brazil's Consumer Protection Code (article 49) or in the European Union.
  'r.8': 'Esta política nunca quita derechos que tengas por la ley de consumo, como el derecho de arrepentimiento del Código de Defensa del Consumidor de Brasil (artículo 49) o el de desistimiento de la Unión Europea.',
  // Privacy policy — REKCUT
  'pv.meta.title': 'Política de privacidad — REKCUT',
  // REKCUT never receives your recordings or projects. What little personal data it keeps for sign-in and exports, why, and how to have it deleted.
  'pv.meta.description': 'REKCUT nunca recibe tus grabaciones ni tus proyectos. Los pocos datos personales que guarda para el inicio de sesión y las exportaciones, por qué, y cómo pedir que se borren.',
  // Privacy policy
  'pv.title': 'Política de privacidad',
  // REKCUT is built so your music never leaves your computer. This page explains the little we do collect, why, and what you can ask us to do with it.
  'pv.lede': 'REKCUT está hecho para que tu música nunca salga de tu computadora. Esta página explica lo poco que recopilamos, por qué, y qué puedes pedirnos que hagamos con ello.',
  // Who is responsible
  'pv.h1': 'Quién es el responsable',
  // What never reaches us
  'pv.h2': 'Lo que nunca nos llega',
  // What we collect
  'pv.h3': 'Lo que recopilamos',
  // Why we use it
  'pv.h4': 'Para qué los usamos',
  // Who we share it with
  'pv.h5': 'Con quién los compartimos',
  // Stored in your browser
  'pv.h6': 'Guardado en tu navegador',
  // How long we keep it
  'pv.h7': 'Cuánto tiempo los guardamos',
  // Your rights
  'pv.h8': 'Tus derechos',
  // Children
  'pv.h9': 'Menores',
  // Changes
  'pv.h10': 'Cambios',
  // %legal.name% is responsible for the personal data described here. For anything about your data, write to <a href="mailto:%legal.email%">%legal.email%</a>.
  'pv.1': '%legal.name% es el responsable de los datos personales descritos aquí. Para cualquier asunto sobre tus datos, escribe a <a href="mailto:%legal.email%">%legal.email%</a>.',
  // Your recordings, cue sheets, tracklists, file names, artwork, projects and videos. Analysis, rendering and encoding happen in your browser, and projects are saved in your browser or in the <code>.djvis</code> files you keep.
  'pv.2': 'Tus grabaciones, archivos cue, tracklists, nombres de archivo, portadas, proyectos y videos. El análisis, el dibujo y la codificación ocurren en tu navegador, y los proyectos se guardan en el navegador o en los archivos <code>.djvis</code> que conservas.',
  // <strong>Your Google account</strong>, when you sign in: your name, email address, profile picture and account id, through Firebase Authentication.
  'pv.3': '<strong>Tu cuenta de Google</strong>, cuando inicias sesión: nombre, correo, foto de perfil e identificador de la cuenta, mediante Firebase Authentication.',
  // <strong>Your plan and exports</strong>: how many free exports you have used, your plan, and for each export its time, whether it was a set or a clip, and whether it was free. No file names or set details.
  'pv.4': '<strong>Tu plan y tus exportaciones</strong>: cuántas exportaciones gratis usaste, tu plan y, de cada exportación, la hora, si fue un set o un clip y si fue gratis. Ningún nombre de archivo ni detalle del set.',
  // <strong>Payments</strong>: Paddle collects your payment details and billing address. We receive only a customer id, the plan you bought and its status.
  'pv.5': '<strong>Pagos</strong>: Paddle recopila los datos de pago y la dirección de facturación. Nosotros solo recibimos un identificador de cliente, el plan comprado y su estado.',
  // <strong>Artwork searches</strong>: to find artwork, your browser sends a track's artist and title to Deezer and Apple Music, and, when you are signed in, to YouTube through our server. We don't keep these searches.
  'pv.6': '<strong>Búsqueda de portadas</strong>: para encontrar las portadas, tu navegador envía el artista y el título del tema a Deezer y Apple Music y, cuando iniciaste sesión, a YouTube a través de nuestro servidor. No guardamos esas búsquedas.',
  // <strong>Technical logs</strong>: our hosting provider records requests, such as IP address, browser and time, to keep the service secure. These logs are deleted after a limited time.
  'pv.7': '<strong>Registros técnicos</strong>: nuestro proveedor de alojamiento registra las solicitudes, como la dirección IP, el navegador y la hora, para mantener el servicio seguro. Esos registros se borran después de un tiempo limitado.',
  // To sign you in, count your exports, give you the plan you paid for, stop abuse of the free exports, answer your messages, and meet our legal and tax duties. The legal bases are the contract with you, our legitimate interest in keeping REKCUT secure, and legal obligations.
  'pv.8': 'Para iniciar tu sesión, contar tus exportaciones, darte el plan que pagaste, evitar abusos de las exportaciones gratis, responder tus mensajes y cumplir nuestras obligaciones legales y fiscales. Las bases legales son el contrato contigo, nuestro interés legítimo en mantener REKCUT seguro y las obligaciones legales.',
  // Google Cloud and Firebase, for hosting, sign-in and our database (in the São Paulo region), and Paddle, which handles payments as Merchant of Record. Artwork searches go to Deezer, Apple and YouTube as described above. Some of these providers process data outside your country under their own safeguards. We don't sell personal data, and we don't use advertising or analytics trackers.
  'pv.9': 'Google Cloud y Firebase, para el alojamiento, el inicio de sesión y nuestra base de datos (en la región de São Paulo), y Paddle, que gestiona los pagos como Merchant of Record. Las búsquedas de portadas van a Deezer, Apple y YouTube, como se describe arriba. Algunos de estos proveedores tratan datos fuera de tu país con sus propias garantías. No vendemos datos personales y no usamos rastreadores de publicidad ni de analítica.',
  // The editor keeps your projects, settings, file permissions and analysis results in your browser's storage, and Firebase keeps you signed in there. This stays on your device, and clearing the site's data removes it. We don't use cookies for advertising or tracking.
  'pv.10': 'El editor guarda tus proyectos, ajustes, permisos de archivos y resultados del análisis en el almacenamiento del navegador, y Firebase mantiene tu sesión allí. Esto se queda en tu dispositivo, y borrar los datos del sitio lo elimina. No usamos cookies de publicidad ni de seguimiento.',
  // Account and export records are kept while your account exists. Payment records are kept for as long as tax law requires. When you ask us to delete your account, we delete its sign-in and export records within 30 days.
  'pv.11': 'Los datos de la cuenta y de las exportaciones se guardan mientras exista la cuenta. Los registros de pago se guardan el tiempo que exija la ley fiscal. Cuando nos pides borrar tu cuenta, borramos el inicio de sesión y los registros de exportación en un plazo de 30 días.',
  // Under Brazil's LGPD, the GDPR and similar laws, you can ask to see, correct, export or delete your data, or object to how we use it. Write to <a href="mailto:%legal.email%">%legal.email%</a>. You can also complain to your data protection authority; in Brazil that is the ANPD.
  'pv.12': 'Según la LGPD de Brasil, el RGPD y leyes similares, puedes pedir ver, corregir, exportar o borrar tus datos, u oponerte a cómo los usamos. Escribe a <a href="mailto:%legal.email%">%legal.email%</a>. También puedes reclamar ante tu autoridad de protección de datos; en Brasil es la ANPD.',
  // REKCUT isn't meant for children under 13, and we don't knowingly collect their data.
  'pv.13': 'REKCUT no está pensado para menores de 13 años, y no recopilamos sus datos a sabiendas.',
  // When this policy changes we update the date at the top. If a change matters, we tell signed-in users before it applies.
  'pv.14': 'Cuando esta política cambia, actualizamos la fecha de arriba. Si el cambio es relevante, avisamos a quienes tienen cuenta antes de que se aplique.',
  // Pricing — REKCUT
  'pp.meta.title': 'Precios — REKCUT',
  // REKCUT pricing: 3 free exports, then US$10 a month or US$45 once for unlimited exports without the REKCUT mark. Payments are handled by Paddle.
  'pp.meta.description': 'Precios de REKCUT: 3 exportaciones gratis, luego US$10 al mes o US$45 una sola vez para exportar sin límite y sin la marca REKCUT. Los pagos los gestiona Paddle.',
  // Pricing
  'pp.title': 'Precios',
  // Edit, preview and save projects for free, as much as you like. You only pay to keep exporting once your 3 free exports are used.
  'pp.lede': 'Edita, mira la vista previa y guarda proyectos gratis, todo lo que quieras. Solo pagas para seguir exportando cuando hayas usado tus 3 exportaciones gratis.',
  // What an export is
  'pp.h1': 'Qué es una exportación',
  // Prices, currency and taxes
  'pp.h2': 'Precios, moneda e impuestos',
  // Who processes your payment
  'pp.h3': 'Quién procesa tu pago',
  // Cancelling and refunds
  'pp.h4': 'Cancelación y reembolsos',
  // Lifetime
  'pp.h5': 'De por vida',
  // An export is one finished MP4: a full set or a single clip, at any size from 720p to 4K. If an export fails or you cancel it before it finishes, it doesn't count.
  'pp.1': 'Una exportación es un MP4 terminado: un set completo o un solo clip, en cualquier tamaño de 720p a 4K. Si una exportación falla o la cancelas antes de que termine, no cuenta.',
  // Prices are in US dollars. Checkout may show the price in your local currency, and adds sales tax or VAT where the law requires it. You see the total before you pay.
  'pp.2': 'Los precios están en dólares estadounidenses. El checkout puede mostrar el precio en tu moneda local y suma el IVA o los impuestos que exija la ley donde vives. Ves el total antes de pagar.',
  // Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders: it takes the payment, sends the receipt or invoice, and handles billing questions and refunds. Your payment details go to Paddle and never reach REKCUT.
  'pp.3': 'Nuestro proceso de compra lo realiza nuestro revendedor online Paddle.com. Paddle.com es el Merchant of Record (vendedor oficial) de todos nuestros pedidos: cobra el pago, envía el recibo o la factura y atiende las dudas de facturación y los reembolsos. Los datos de tu pago van a Paddle y nunca llegan a REKCUT.',
  // Cancel Monthly at any time from Account ▸ Manage plan in the editor, or from the link in your Paddle receipt. It keeps working until the end of the month you paid for. Any payment can be refunded within %legal.refundDays% days: see the <a href="./refund.html">refund policy</a>.
  'pp.4': 'Cancela Mensual cuando quieras desde Cuenta ▸ Administrar plan, en el editor, o desde el enlace de tu recibo de Paddle. Sigue funcionando hasta el final del mes que pagaste. Cualquier pago se puede reembolsar dentro de los %legal.refundDays% días: mira la <a href="./refund.html">política de reembolso</a>.',
  // Lifetime is one payment for unlimited exports without the REKCUT mark, on the account that bought it, for as long as REKCUT is offered. It includes future editor features and never renews.
  'pp.5': 'De por vida es un solo pago para exportar sin límite y sin la marca REKCUT, en la cuenta que lo compró, mientras REKCUT se ofrezca. Incluye las funciones futuras del editor y nunca se renueva.',
  // Buying a plan means you agree to the <a href="./terms.html">terms of service</a>. Read how we handle your data in the <a href="./privacy.html">privacy policy</a>.
  'pp.6': 'Al comprar un plan aceptas los <a href="./terms.html">términos del servicio</a>. Lee cómo tratamos tus datos en la <a href="./privacy.html">política de privacidad</a>.'
}
