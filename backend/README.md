# Backend legado (somente leitura)

As páginas de documentos agora são HTML estático e não dependem deste backend
para editar, enviar ou excluir arquivos. A edição é feita diretamente no HTML
do setor e os PDFs/vídeos ficam nas pastas `pdf/` e `videos/`.

Este servidor é mantido apenas para compatibilidade com consumidores antigos da
rota `GET /api/manifest`. Não existem rotas de upload, alteração ou exclusão.
