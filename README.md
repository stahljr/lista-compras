# Lista de Compras

Nossa lista de compras do mercado, compartilhada: os dois adicionam itens no
mesmo carrinho, o app busca preço em **Angeloni, Festval, Muffato e Condor**,
diz onde vale mais a pena comprar e acompanha a compra dentro do mercado.

É um PWA — instala no celular pela tela de início e continua funcionando
quando o sinal cai dentro do mercado.

## O que ele faz

**Carrinho compartilhado.** Os dois vão jogando item ao longo da semana, cada
um do seu celular. Quem adicionou aparece do lado. As mudanças chegam no outro
aparelho na hora, sem precisar recarregar.

**Itens com foto e categoria.** Buscando pelo nome, o app procura nos quatro
mercados e devolve o produto com foto, marca e o preço de cada um — o mais
barato destacado. Os itens são agrupados por categoria (hortifruti, padaria,
mercearia, limpeza…) na ordem em que se anda pelas gôndolas.

**Listas prontas.** Além do carrinho da semana, dá para salvar listas que se
repetem — limpeza, churrasco, farmácia — e jogar a lista inteira no carrinho
com um toque. O carrinho atual também pode ser salvo como lista.

**Onde comprar.** Com o carrinho montado, o app calcula quanto sairia em cada
mercado e aponta o melhor. Testa também as seis combinações de dois mercados e
sugere dividir a compra quando isso economiza de verdade.

**Modo mercado.** Chegando no mercado, "Cheguei no mercado" transforma a lista
numa compra: marca-se o que já foi pego, anota-se o preço da etiqueta, e o app
responde a pergunta do corredor — **já pegamos tudo? o que falta?** — com o
total gasto até ali e o que ainda falta, por seção.

**Fechamento.** Ao encerrar, você escolhe o que fazer com a lista: tirar só o
que comprou e deixar o resto, limpar tudo, ou não mexer. Os preços anotados
viram histórico, que serve de estimativa na próxima ida.

**Sinal ruim não trava a compra.** Dentro de alguns mercados o sinal é
péssimo, e é justamente ali que você está marcando itens. Então:

- O app abre com o último estado conhecido, sem depender da rede. Recarregar
  a página offline mostra a compra em andamento, não a tela de login.
- Marcar item e anotar preço funcionam sem conexão: a tela responde na hora e
  a escrita fica numa fila no próprio aparelho. Uma tarja avisa quantas
  marcações ainda estão só ali.
- Quando o sinal volta, a fila sobe sozinha e o servidor passa a ser a
  verdade. Marcar e depois anotar o preço do mesmo item vira uma escrita só,
  com as duas informações.
- O que **precisa** de conexão é buscar produto novo e comparar preço — os
  dois consultam os mercados na hora. O resto da compra segue offline.

## Rodando

```bash
npm install
cp .env.example .env      # defina INVITE_CODE
npm run build             # compila o app
npm start                 # http://localhost:3000
```

Em desenvolvimento, `npm run dev` sobe a API na 3000 e o Vite na 5173 com
proxy da API.

Para encher o catálogo de saída (as categorias já vêm com produto e a primeira
busca responde na hora):

```bash
npm run seed
```

### Docker

```bash
echo "INVITE_CODE=algum-codigo" > .env
docker compose up -d --build
```

O banco fica num volume, então atualizar a imagem não perde a lista.

### As duas contas

O **primeiro** cadastro cria a casa e não pede código. A partir do segundo, é
preciso o `INVITE_CODE` do `.env` — é isso que impede que o app fique aberto
para qualquer um caso você o exponha na internet. Passe o código para a outra
pessoa e pronto: os dois compartilham o mesmo carrinho e as mesmas listas.

Se for publicar fora da rede local, coloque atrás de HTTPS (o cookie de sessão
é marcado `Secure` quando `NODE_ENV=production`).

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
  listas são reconsultados a cada `REFRESH_HOURS`.
- **Os endpoints não são contratos.** São endpoints internos dos sites; se uma
  rede mudar de plataforma, o adaptador daquele mercado para de funcionar e
  precisa ser remapeado. Os outros continuam.
- **A fila offline guarda intenção, não histórico.** Ela existe para a compra
  não travar sem sinal; se você desinstalar o app com marcações pendentes,
  elas se perdem.

## Estrutura

```
server/src/
  index.js            servidor, serve a API e o app compilado
  db.js               esquema SQLite
  auth.js             senha (scrypt) e sessão em cookie httpOnly
  categories.js       as categorias da casa e a classificação dos produtos
  catalog.js          catálogo unificado: junta os mercados por EAN
  compare.js          custo por mercado e a divisão em dois
  refresher.js        reconsulta periódica dos preços das listas
  realtime.js         canal SSE que sincroniza os dois celulares
  markets/            um adaptador por mercado (vtex.js, condor.js)
  routes/             auth, catalog, lists, trips
web/src/
  pages/              Carrinho, Buscar, Listas, Compra, Onde comprar, Histórico
  lib/store.tsx       estado do app e sync
  lib/offline.ts      cache local e fila de escritas para o mercado sem sinal
  lib/tripLocal.ts    recálculo da compra no aparelho, para a tela não esperar
tools/gerar-icones.mjs  gera os ícones do PWA
```

O app é servido pelo próprio servidor Node: um processo, um arquivo SQLite,
nenhum serviço externo.
