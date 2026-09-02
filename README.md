# Lista de Compras

Nossa lista de compras do mercado, compartilhada: os dois anotam na mesma
lista, o app busca preço em **Angeloni, Festval, Muffato e Condor**, diz onde
vale mais a pena comprar, e no mercado vira a lista de conferência do carrinho.

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

Em desenvolvimento, `npm run dev` sobe a API na 3000 e o Vite na 5173 com proxy
da API.

Para encher o catálogo de saída (as categorias já vêm com produto e a primeira
busca responde na hora):

```bash
npm run seed
```

## Colocando no ar

O app é um processo Node e um arquivo SQLite, sem serviço externo. O que ele
precisa é de um **endereço HTTPS**: sem isso o navegador não instala o PWA nem
registra o service worker, e você perde justamente o modo offline dentro do
mercado. `http://` só é aceito em `localhost`.

Três caminhos, do mais simples ao mais caseiro:

### Fly.io — uma máquina com volume

Já tem `fly.toml` no repositório. HTTPS sai de graça e o SQLite fica num
volume, então atualizar a imagem não perde a lista.

```bash
fly launch --no-deploy --copy-config
fly volumes create dados --size 1 --region gru
fly secrets set INVITE_CODE=escolha-um-codigo
fly deploy
```

A máquina dorme entre os acessos e acorda quando alguém abre o app — a primeira
tela pode levar uns segundos. Uma máquina só: SQLite não é compartilhado entre
instâncias, e é por isso que `min_machines_running` fica em 0 em vez de escalar.

### Docker em qualquer VPS

```bash
echo "INVITE_CODE=escolha-um-codigo" > .env
docker compose up -d --build
```

O banco fica num volume. Falta o HTTPS: ponha um Caddy ou nginx na frente com
um domínio, ou use um Cloudflare Tunnel apontando para a porta 3000.

### Um computador em casa

Serve se você já tem um PC ou Raspberry sempre ligado. Rode com Docker (acima)
e exponha com **Cloudflare Tunnel**, que dá um domínio HTTPS sem abrir porta no
roteador:

```bash
cloudflared tunnel --url http://localhost:3000
```

Só na rede local (`http://192.168.x.x:3000`) o app abre no navegador, mas **não
instala como PWA e não funciona offline** — o que anula metade da ideia.

### Instalando no celular

Com o endereço HTTPS em mãos, no celular: abra o link, menu do navegador →
**Adicionar à tela de início**. No iPhone é pelo Safari (Compartilhar →
Adicionar à Tela de Início); no Android, pelo Chrome.

### As duas contas

O **primeiro** cadastro cria a casa e não pede código. A partir do segundo, é
preciso o `INVITE_CODE` — é isso que impede que o app fique aberto para
qualquer um. Passe o código para a outra pessoa e pronto: os dois compartilham
a mesma lista e o mesmo carrinho.

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
  db.js               esquema SQLite
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

O app é servido pelo próprio servidor Node: um processo, um arquivo SQLite,
nenhum serviço externo.
