# NaCesta

Quatro mercados, uma lista. A lista de compras da casa, compartilhada: todo
mundo da família anota na mesma lista, o app busca preço em **Angeloni,
Festval, Muffato e Condor**, diz onde vale mais a pena comprar, e no mercado
vira a lista de conferência do carrinho.

Cada família tem a sua lista, isolada das outras — dá para usar junto com a
casa da mãe sem que uma veja as compras da outra.

É um PWA — instala no celular pela tela de início e continua funcionando
quando o sinal cai dentro do mercado.

## O que ele faz

O app tem duas metades, e a diferença entre elas é o que faz ele funcionar:
**lista é preparação, carrinho é mercado.**

### Lista — o que precisamos comprar

A **lista geral** é onde os dois vão anotando o que falta em casa, cada um do
seu celular. Quem colocou aparece do lado, e o que um adiciona chega no outro
aparelho na hora. Ela é da próxima compra: quando o carrinho a leva, ela volta
vazia.

As **listas rápidas** são as que se repetem — limpeza, churrasco, farmácia.
Ficam cadastradas e usá-las no carrinho não as apaga.

Buscando pelo nome, o app procura nos quatro mercados e devolve o produto com
foto, marca e o preço de cada um, com o mais barato destacado. Os itens são
agrupados por categoria (hortifruti, padaria, mercearia, limpeza…) na ordem em
que se anda pelas gôndolas.

### Onde comprar — a decisão

Comparar preço é decisão de planejamento, não de corredor. Com a lista montada,
o app calcula quanto sairia em cada mercado, aponta o melhor, e testa as seis
combinações de dois mercados para sugerir dividir a compra quando isso
economiza de verdade.

**O preço é congelado aqui.** Quando um item do catálogo entra na lista, o
preço de cada mercado é gravado junto com ele — e reconfirmado quando o
comparador roda, que é o momento em que se decide. Esse é o número que vale na
compra. Dentro do mercado o app **não consulta preço nenhum**: só carrega o que
já estava gravado. É o que faz o carrinho abrir instantaneamente em vez de
esperar quatro consultas por item, justamente onde o sinal é pior.

### Carrinho — o que já peguei

Chegando no mercado, "Montar carrinho" pergunta **quais listas vão** — a geral,
uma rápida, várias — e monta a lista de conferência da loja. Item que aparece em
duas listas soma a quantidade em vez de virar duas linhas. Já com o carrinho
aberto, ainda dá para trazer outra lista ou lembrar de um item solto.

Ali o trabalho é um só: **marcar o que já foi pego**. O total fecha sozinho com
o preço da lista, sem digitar nada, e o app responde a pergunta do corredor —
**já pegamos tudo? o que falta?** — com o gasto até ali e o que resta, por
seção.

Corrigir preço é **opcional**: o campo já vem com o preço da lista e só precisa
ser mexido se a etiqueta estiver diferente. Quando você mexe, o item ganha a
marca "preço corrigido" e o total se ajusta. Itens escritos à mão não têm preço
e simplesmente não entram na soma — não viram pendência a cobrar.

### O que sobrou vira lista nova

Ao fechar o carrinho, o app responde se pegamos tudo. **Se sobrou algo, o que
ficou volta como uma lista nova** — "Faltou no Condor · 02/09" — pronta para
outro mercado ou outro dia. Não importa o motivo: faltou na loja, o preço ali
não valia, você mudou de ideia. O item continua sendo preciso, e é o único
destino que faz sentido para ele.

As listas de uso único são consumidas nesse fecho, mas **só do que realmente
entrou no carrinho**. Cada item que foi para o mercado terminou comprado ou
copiado para a lista nova, então sai da origem — e o que foi anotado na lista
*depois* de o carrinho ser montado (a outra pessoa mexeu na lista enquanto você
estava na fila) nunca esteve no carrinho e continua lá.

Por isso **uma lista só desaparece se tiver zerado**. A lista geral é permanente
e fica com o que sobrou dela; uma lista de sobra que ainda tem item continua
valendo. As listas rápidas cadastradas nunca são tocadas — foram feitas para
repetir.

### Sinal ruim não trava a compra

Dentro de alguns mercados o sinal é péssimo, e é justamente ali que você está
marcando itens. Então:

- O app abre com o último estado conhecido, sem depender da rede. Recarregar a
  página offline mostra o carrinho em andamento, não a tela de login.
- Marcar item e corrigir preço funcionam sem conexão: a tela responde na hora,
  o total é recalculado no aparelho e a escrita fica numa fila local. Uma tarja
  avisa quantas marcações ainda estão só ali.
- Quando o sinal volta, a fila sobe sozinha e o servidor passa a ser a verdade.
  Marcar e depois corrigir o preço do mesmo item vira uma escrita só, com as
  duas informações.
- O que **precisa** de conexão é buscar produto novo e comparar preço — os dois
  consultam os mercados na hora, e ambos são coisa de montar lista, não de
  mercado. O carrinho roda offline de ponta a ponta, porque o preço dele já
  está gravado.

## Rodando na sua máquina

```bash
npm install
cp .env.example .env      # defina INVITE_CODE
npm run build             # compila o app
npm start                 # http://localhost:3000
```

Sem `DATABASE_URL`, o app sobe um Postgres embutido em arquivo (PGlite) dentro
de `data/` — mesmo banco, mesmo dialeto, zero instalação. Para desenvolver
contra o Postgres de verdade, basta exportar a `DATABASE_URL`.

Em desenvolvimento, `npm run dev` sobe a API na 3000 e o Vite na 5173 com proxy
da API.

Para encher o catálogo de saída (as categorias já vêm com produto e a primeira
busca responde na hora):

```bash
npm run seed
```

## Colocando no ar

O app é um processo Node com um Postgres do lado. Ele precisa de três coisas do
lugar onde for rodar:

1. **Executar Node.** Não é site estático.
2. **Um Postgres**, informado em `DATABASE_URL` — Supabase, Neon, qualquer um.
   É o banco que guarda conta, sessão e lista; por estar fora do servidor, o
   login vale em qualquer aparelho e sobrevive a deploy, reinício e ao sono do
   plano gratuito. Não precisa de disco.
3. **Um endereço HTTPS.** Sem isso o navegador não instala o PWA nem registra o
   service worker, e você perde justamente o modo offline dentro do mercado.
   `http://` só é aceito em `localhost`.

### Por que o GitHub Pages não serve

O Pages entrega arquivo estático e nada mais: não roda Node, não tem disco, não
tem `/api`. Login, lista compartilhada e sync entre os dois celulares dependem
de servidor.

E há um segundo impedimento, independente do primeiro: três dos quatro mercados
não mandam `Access-Control-Allow-Origin`, então o navegador **bloqueia** a
chamada direta a eles. Hoje quem consulta os mercados é o servidor, onde CORS
não existe. Do navegador, só o Condor responderia.

### Supabase — o banco fora do servidor

O que o app precisa do Supabase é uma linha: a connection string.

1. https://supabase.com/dashboard → seu projeto (plano free serve).
2. Botão **Connect**, no topo → aba **Connection string**.
3. Escolha **Session pooler** — host `aws-…-pooler.supabase.com`, porta
   **5432**. Ele se comporta como um Postgres normal, que é o que um servidor
   de processo longo como este quer. O **Transaction pooler** (6543, mesmo
   host) também funciona com este app.

   **Não** use a "direct connection" (`db.<ref>.supabase.co`): ela responde só
   em IPv6, e o Render sai por IPv4. O painel avisa que o transaction pooler
   "usa IPv6 por padrão" e oferece um add-on pago de IPv4 — na prática o host
   compartilhado do pooler resolve em IPv4 (só registros A), então o add-on não
   é necessário.
4. Copie a string e troque `[YOUR-PASSWORD]` pela senha do banco (a que você
   definiu ao criar o projeto; dá para gerar outra em **Settings → Database**).

Não precisa criar tabela nem rodar migração: **o app cria o esquema sozinho no
primeiro boot**, e o mesmo código cuida das mudanças seguintes. A integração
com o GitHub que aparece nas configurações do Supabase é para quem versiona
migrações na pasta `supabase/` — este projeto não usa, e deixá-la ligada não
atrapalha.

Duas coisas que valem saber do plano free:

- **RLS.** As tabelas nascem em `public`, que no Supabase fica ao alcance da API
  pública do projeto (a *anon key* vai no navegador de qualquer visitante). Por
  isso o app **liga Row Level Security em todas as tabelas e não cria nenhuma
  policy**: essa API não lê nem escreve uma linha, enquanto o servidor —
  que conecta como dono das tabelas — continua trabalhando normalmente. Aqui
  tem e-mail e hash de senha; não é detalhe.
- **O projeto pausa** depois de 7 dias sem nenhuma atividade, e volta com um
  clique no painel. Usando o app toda semana, ele não pausa.

### Render — publicar é colar a connection string

O Render publica direto do GitHub, sem terminal: ele lê o `render.yaml` da raiz.

1. https://dashboard.render.com → **New** → **Blueprint** → escolha o
   repositório `lista-compras`. Escolha a região **mais perto do banco** (com
   o Supabase em us-west-2, é Oregon): cada tela faz várias consultas, e
   atravessar o país a cada uma soma. Região de serviço no Render não muda
   depois de criado.
2. Ele pede as duas variáveis que faltam:
   - **DATABASE_URL** — a string do Supabase (passo acima).
   - **INVITE_CODE** — o código que a segunda pessoa digita para entrar na
     mesma casa.
3. **Apply**. O endereço sai como `https://lista-compras-xxxx.onrender.com`.

Depois disso, cada `git push` neste branch republica sozinho.

Se o serviço já existe, criado à mão: **Settings → Environment** →
`DATABASE_URL` e `INVITE_CODE`. Se ele tinha um disco em `/data`, dá para
remover: o banco não vive mais ali.

O plano **free** agora serve de verdade — o que se perdia nele era o disco, e
não há mais disco. O único incômodo que resta é o serviço dormir depois de 15
minutos parado, o que faz a primeira tela demorar quase um minuto; o Starter
tira o sono.

### Guardar e devolver os dados

Independente de onde o app rode, dá para levar as listas embora:

- **Perfil → Baixar backup** salva um `.json` com as listas, os itens (com o
  preço congelado) e o histórico de preços pagos.
- **Perfil → Restaurar backup** devolve esse arquivo para dentro do app. Ele
  **acrescenta**: item que já existe fica como está, lista rápida de mesmo nome
  recebe só o que falta. Restaurar duas vezes por engano não duplica nada.

O arquivo não guarda id de produto, e por isso funciona entre instalações
diferentes: cada item viaja com o EAN (ou o nome normalizado), e a restauração
o liga de novo ao produto do catálogo local quando ele existe por lá.

### Fly.io — uma máquina com volume

> Este app rodou na Fly antes de ir para o Render, e o passo a passo abaixo
> continua valendo. Duas ressalvas: com `DATABASE_URL` apontando para um
> Postgres (a seção do Supabase acima) o volume deixa de ser necessário — dá
> para pular o passo do disco e definir a variável em vez dele; e o workflow
> que publicava pelo GitHub foi removido junto com a mudança para o Render (ele
> está no histórico do git, se você quiser de volta).

A Fly não tem deploy pelo site: o painel mostra o app, os logs, o volume e os
segredos, mas quem publica é o `flyctl`, no terminal. A configuração abaixo é
feita **uma vez**; depois dela, publicar passa a ser um botão aqui no GitHub
(veja "Publicando sem terminal").

#### Uma vez só, no terminal

No Windows, abra o **PowerShell** (tecla Windows, digite `powershell`, Enter).
No Mac ou Linux, o Terminal. Cole um bloco por vez.

O PowerShell abre em `C:\WINDOWS\System32`, que é pasta do sistema — não é
lugar de baixar projeto. Primeiro vá para uma pasta sua:

```powershell
cd ~
mkdir projetos -Force
cd projetos
```

Agora o flyctl. **O Windows tem instalador próprio (`install.ps1`)** — o
`install.sh` que aparece na documentação da Fly é para Mac e Linux, e no
PowerShell ele só devolve erro:

```powershell
# Windows
iwr https://fly.io/install.ps1 -useb | iex
```

```bash
# Mac ou Linux
curl -L https://fly.io/install.sh | sh
```

O instalador termina dizendo para adicionar uma pasta ao `PATH`. **Feche o
PowerShell e abra de novo** para ele valer — e volte para a pasta
(`cd ~\projetos`). Confira com `fly version`: se aparecer um número,
funcionou.

```powershell
# 2. criar a conta (abre o navegador; já tem conta? use fly auth login)
fly auth signup
```

```powershell
# 3. baixar o projeto (precisa do Git: https://git-scm.com/download/win)
git clone https://github.com/stahljr/lista-compras.git
cd lista-compras
```

Os passos seguintes têm de rodar **dentro dessa pasta** — é lá que está o
`fly.toml`. Se você fechar o PowerShell, volte com `cd ~\projetos\lista-compras`.

```powershell
# 4. criar o app, sem publicar ainda
fly launch --no-deploy --copy-config
```

Duas perguntas aparecem aqui:

- *"Would you like to tweak these settings?"* → responda **No**. O `fly.toml`
  do repositório já está do jeito certo, e aceitar faz o flyctl reescrevê-lo.
O nome `lista-compras` é global na Fly e provavelmente já está em uso: nesse
caso o flyctl **gera um** (algo como `lista-compras-quiet-paper-3911`) e grava
no seu `fly.toml`. Anote qual saiu — é ele que o deploy automático vai usar.

```powershell
# 5. criar o disco onde o banco vive
fly volumes create dados --size 1 --region gru
```

Se aparecer um aviso de que a organização não tem forma de pagamento, é aqui
que ele costuma travar: volume é recurso pago e a Fly pede cartão mesmo quando
o trial cobre o uso. Sem volume o app sobe, mas grava no disco efêmero e
**perde a lista a cada deploy** — então não vale seguir sem ele.

```powershell
# 6. o código de convite da segunda pessoa
fly secrets set INVITE_CODE=escolha-um-codigo
```

```powershell
# 7. publicar
fly deploy --ha=false
```

```powershell
# 8. abrir no navegador
fly open
```

**O `--ha=false` não é detalhe** enquanto o banco for o volume da máquina: a
Fly sobe duas máquinas por padrão, e duas máquinas não montam o mesmo volume.
Com `DATABASE_URL` apontando para um Postgres, essa amarra cai — as duas
máquinas passam a poder atender, porque o estado não está mais no disco de
nenhuma delas.

Se o flyctl trocou o nome do app no passo 4, salve isso no repositório para o
deploy automático usar o nome certo:

```powershell
git add fly.toml
git commit -m "Ajusta o nome do app na Fly"
git push
```

#### Publicando as próximas vezes

Da pasta do projeto:

```powershell
fly deploy --remote-only --ha=false
```

A imagem é construída nos servidores da Fly (`--remote-only`), então você não
precisa de Docker em lugar nenhum. O `--ha=false` importa enquanto o banco for
o volume da máquina — veja a nota acima.

#### Depois de estar no ar

```powershell
fly logs                            # acompanhar / ver erro
fly status                          # estado da máquina
fly ssh console -C "npm run seed"   # opcional: já abre com catálogo cheio
```

**Sobre a espera da primeira tela.** O `fly.toml` vem com
`auto_stop_machines = 'suspend'`: parada a máquina congela com a memória
intacta e volta em fração de segundo — diferente de desligar e ter que subir o
processo outra vez. Se você preferir não ter espera nenhuma, deixe a máquina
sempre de pé:

```toml
auto_stop_machines = 'off'
min_machines_running = 1
```

Isso passa a contar como uso contínuo — confira o preço atual na Fly antes.

Vale lembrar que o modo offline ameniza o problema: o app abre com o último
estado guardado no aparelho, sem esperar o servidor. Quem espera é só a
primeira sincronização.

### Docker em qualquer VPS

```bash
echo "INVITE_CODE=escolha-um-codigo" > .env
docker compose up -d --build
```

O banco fica num volume. Falta o HTTPS: ponha um Caddy ou nginx na frente com
um domínio, ou use um Cloudflare Tunnel apontando para a porta 3000.

O `Dockerfile` é multi-estágio para a imagem final não carregar as
dependências do front nem o build. Ele não precisa mais de compilador: desde
que o banco virou Postgres, não há módulo nativo no servidor (o driver `pg` é
JavaScript puro).

### Um computador em casa

Serve se você já tem um PC ou Raspberry sempre ligado — e resolve de vez a
espera da primeira tela, porque nada dorme. Rode com Docker (acima) e exponha
com **Cloudflare Tunnel**, que dá um domínio HTTPS sem abrir porta no roteador:

```bash
cloudflared tunnel --url http://localhost:3000
```

Só na rede local (`http://192.168.x.x:3000`) o app abre no navegador, mas **não
instala como PWA e não funciona offline** — o que anula metade da ideia.

### Hospedagens sem disco persistente

Deixaram de ser um problema: com o banco no Postgres, disco efêmero não apaga
nada. O que ainda incomoda nesses planos é o serviço dormir quando fica ocioso
— a primeira tela depois do sono demora. O backup do Perfil continua valendo
para trocar de hospedagem, ou por precaução.

### Instalando no celular

Com o endereço HTTPS em mãos, no celular: abra o link, menu do navegador →
**Adicionar à tela de início**. No iPhone é pelo Safari (Compartilhar →
Adicionar à Tela de Início); no Android, pelo Chrome.

### As contas e as famílias

O **primeiro** cadastro cria a primeira casa, não pede código e vira o
**administrador**. Do segundo em diante ninguém entra sem um convite — e é o
convite que decide **em qual casa** a pessoa cai.

Uma casa (família) é uma fronteira de dados: lista, carrinho, histórico e o
"já pagamos" ficam dentro dela, e nenhuma tela atravessa essa linha. Vale para
o administrador também: ele cria as casas e distribui convites, não enxerga as
compras das outras.

No Perfil → **Famílias**, quem administra pode:

- criar uma casa nova (ela nasce com um convite pronto);
- copiar o convite para passar a quem vai usar;
- gerar um convite novo (o anterior deixa de valer na hora);
- fechar a casa para novos cadastros;
- apagar uma casa — só se estiver vazia, porque apagar uma casa com gente
  dentro levaria as listas dessas pessoas junto.

O `INVITE_CODE` do servidor continua valendo como convite da primeira casa,
para quem já tinha esse código em mãos.

## Como os preços são obtidos

Não há API pública documentada para isso, então cada rede foi mapeada a partir
do próprio site. O resultado é um adaptador por mercado, todos devolvendo o
mesmo formato:

| Mercado | Plataforma | Endpoint |
|---|---|---|
| Angeloni | VTEX (`superangeloni`) | `/api/catalog_system/pub/products/search` |
| Festval | VTEX (`meufestval`) | idem |
| Muffato | VTEX (`www.supermuffato.com.br`) | idem |
| Condor | osuper | `sense.osuper.com.br/314/<loja>/search` |

Três das quatro rodam VTEX e compartilham a mesma API pública de catálogo,
mudando só a conta e o domínio. O Condor roda outra plataforma, cuja busca fica
num serviço separado que responde JSON simples.

**O casamento entre mercados é feito por EAN** (código de barras): é o que
permite dizer que o arroz do Angeloni e o do Condor são o mesmo produto e
comparar o preço. Os três VTEX devolvem o EAN direto. O Condor não devolve, mas
o nome do arquivo da imagem carrega o código em cerca de 94% dos produtos, e é
de lá que ele é extraído; no resto, o casamento cai para o nome normalizado.

Itens escritos à mão ("papel toalha") não têm produto vinculado e por isso não
entram na comparação de preço — aparecem numa seção separada. Buscar o produto
no catálogo resolve.

### Detalhes que valem saber

- **Preço é por loja.** `CONDOR_STORE_ID` define a loja do Condor (o padrão é
  Curitiba, Nilo Peçanha). As contas VTEX atendem a rede toda, mas preço e
  estoque ainda podem variar por região.
- **Cada mercado responde por si.** Um mercado fora do ar vira um aviso na
  tela; a busca segue com os outros três.
- **As buscas ficam em cache** (`SEARCH_TTL_MINUTES`, 6h por padrão) para não
  bater nos sites a cada tecla digitada. Os preços dos itens que estão nas
  listas são reconsultados a cada `REFRESH_HOURS`, para o comparador decidir
  com número atual — o preço congelado no item só é reescrito quando você abre
  o comparador.
- **Os endpoints não são contratos.** São endpoints internos dos sites; se uma
  rede mudar de plataforma, o adaptador daquele mercado para de funcionar e
  precisa ser remapeado. Os outros continuam.
- **A fila offline guarda intenção, não histórico.** Ela existe para a compra
  não travar sem sinal; se você desinstalar o app com marcações pendentes,
  elas se perdem.
- **Item que o mercado escolhido não tinha** cai no menor preço congelado, e
  não fica sem preço — o total do carrinho é uma referência, não a nota fiscal.
  Se o número importar, corrija na hora de pegar o item.
- **O histórico guarda o preço que valeu**, corrigido ou o da lista. No banco
  de preços entra só o que você corrigiu à mão: o preço da lista já veio do
  mercado e não é informação nova.

## Estrutura

```
server/src/
  index.js            servidor, serve a API e o app compilado
  db.js               esquema Postgres
  pg.js               conexao e a casca fina sobre o driver
  auth.js             senha (scrypt) e sessão em cookie httpOnly
  categories.js       as categorias da casa e a classificação dos produtos
  catalog.js          catálogo unificado: junta os mercados por EAN
  compare.js          custo por mercado e a divisão em dois
  snapshot.js         congela o preço na montagem da lista e o lê no carrinho
  refresher.js        reconsulta periódica dos preços das listas
  realtime.js         canal SSE que sincroniza os dois celulares
  markets/            um adaptador por mercado (vtex.js, condor.js)
  routes/             auth, catalog, lists, trips
web/src/
  pages/              Lista, Buscar, Listas, Carrinho, Onde comprar, Histórico
  lib/store.tsx       estado do app e sync
  lib/offline.ts      cache local e fila de escritas para o mercado sem sinal
  lib/tripLocal.ts    recálculo da compra no aparelho, para a tela não esperar
tools/gerar-icones.mjs  gera os ícones do PWA
```

O app é servido pelo próprio servidor Node: um processo, um Postgres do lado,
nenhum serviço externo.
