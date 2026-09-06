import { handleRequest, type Env } from "../src/index";

export const onRequest: PagesFunction<Env> = ({ request, env }) =>
  handleRequest(request, env);
