// THIS FILE IS GENERATED. DO NOT EDIT.

export type AppType = import('hono').Hono<
  {},
  {
    "/api/status": {
        $get: {
            input: Record<never, never>;
        } & {
            output: {
                runtime: string;
                desktop: string;
                transport: string;
                context: string;
            };
            outputFormat: "json";
            status: 200;
        };
    };
} & {
    "/api/tasks": {
        $get: {
            input: Record<never, never>;
        } & {
            output: {
                tasks: readonly {
                    readonly id: number;
                    readonly title: string;
                    readonly done: boolean;
                }[];
            };
            outputFormat: "json";
            status: 200;
        };
    };
} & {
    "/api/tasks": {
        $post: {
            input: Record<never, never> & {
                json: {
                    title: string;
                };
            };
        } & ({
            output: {
                readonly id: number;
                readonly title: string;
                readonly done: boolean;
            };
            outputFormat: "json";
            status: 201;
        } | {
            output: import("@zeltjs/core").ValidationErrorBody;
            outputFormat: "json";
            status: 400;
        });
    };
} & {
    "/api/tasks/:id": {
        $patch: {
            input: {
                param: {
                    id: string;
                };
            } & {
                json: {
                    done: boolean;
                };
            };
        } & ({
            output: import("@zeltjs/core").ValidationErrorBody;
            outputFormat: "json";
            status: 400;
        } | {
            output: {
                readonly id: number;
                readonly title: string;
                readonly done: boolean;
            };
            outputFormat: "json";
            status: 200;
        } | {
            output: {
                message: string;
            };
            outputFormat: "json";
            status: 404;
        });
    };
} & {
    "/api/tasks/:id": {
        $delete: {
            input: {
                param: {
                    id: string;
                };
            } & Record<never, never>;
        } & ({
            output: undefined;
            outputFormat: "body";
            status: 204;
        } | {
            output: {
                message: string;
            };
            outputFormat: "json";
            status: 404;
        });
    };
} & {
    "/api/window/title": {
        $post: {
            input: Record<never, never> & {
                json: {
                    title: string;
                };
            };
        } & ({
            output: import("@zeltjs/core").ValidationErrorBody;
            outputFormat: "json";
            status: 400;
        } | {
            output: {
                title: string;
            };
            outputFormat: "json";
            status: 200;
        });
    };
},
  "/"
>;
