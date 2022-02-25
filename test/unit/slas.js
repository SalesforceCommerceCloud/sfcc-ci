const sinon = require("sinon");
const proxyquire = require("proxyquire").noCallThru().noPreserveCache();
const jsonwebtoken = require("jsonwebtoken");
const { Response } = require("node-fetch");

const TENANT = {
    shortcode: "aaaaaaa",
    tenant: "aaaa_001",
};
const CLIENT = Object.assign(
    { client: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    TENANT
);
const TOKEN = jsonwebtoken.sign(
    {
        sub: "user@example.com",
        tenantFilter: "SLAS_ORGANIZATION_ADMIN:aaa_001",
        roles: ["SLAS_ORGANIZATION_ADMIN"],
    },
    "very-secret"
);

const fetchStub = sinon.stub();

const slas = proxyquire("../../lib/slas", {
    "node-fetch": fetchStub,
    "./auth": {
        getToken: () => TOKEN,
    },
});

describe("Shopper Login and API Access Service (SLAS)", () => {
    afterEach(() => fetchStub.reset());

    describe("Tenant CLI", () => {
        it("Creates", async () => {
            const response = {
                contact: null,
                description: "Created by SFCC-CI at 2022-01-01T12:00:00.000Z",
                emailAddress: "user@example.com",
                instance: "aaaa_001",
                merchantName: "_",
                phoneNo: null,
            };

            fetchStub.returns(
                Promise.resolve(
                    new Response(JSON.stringify(response), { status: 200 })
                )
            );

            await slas.cli.tenant.create(TENANT);

            sinon.assert.calledOnce(fetchStub);
            sinon.assert.calledWithMatch(
                fetchStub,
                slas.getSlasUrl(TENANT),
                sinon.match({
                    body: sinon.match.string,
                    headers: {
                        Authorization: `Bearer ${TOKEN}`,
                        "Content-Type": "application/json",
                    },
                    method: "PUT",
                })
            );
        });

        it("Gets", async () => {
            const response = {
                contact: null,
                description: "Created by SFCC-CI at 2022-01-01T12:00:00.000Z",
                emailAddress: "user@example.com",
                instance: "aaaa_001",
                merchantName: "_",
                phoneNo: null,
            };

            fetchStub.returns(
                Promise.resolve(
                    new Response(JSON.stringify(response), { status: 200 })
                )
            );

            await slas.cli.tenant.get(TENANT);

            sinon.assert.calledOnce(fetchStub);
            sinon.assert.calledWithMatch(
                fetchStub,
                slas.getSlasUrl(TENANT),
                sinon.match({
                    headers: {
                        Authorization: `Bearer ${TOKEN}`,
                    },
                })
            );
        });
    });

    describe("Client CLI", () => {
        it("Gets", async () => {
            const response = {
                clientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                name: "test",
                scopes: "sfcc.shopper-categories",
                redirectUri: "http://localhost:3000/callback",
                channels: ["RefArch", "RefArchGlobal"],
                isPrivateClient: false,
            };

            fetchStub.returns(
                Promise.resolve(
                    new Response(JSON.stringify(response), { status: 200 })
                )
            );

            await slas.cli.client.get(CLIENT);

            sinon.assert.calledOnce(fetchStub);
            sinon.assert.calledWithMatch(
                fetchStub,
                slas.getSlasUrl(CLIENT),
                sinon.match({
                    headers: {
                        Authorization: `Bearer ${TOKEN}`,
                        "Content-Type": "application/json",
                    },
                })
            );
        });

        it("Lists", async () => {
            const response = {
                data: [
                    {
                        clientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                        name: "test",
                        scopes: "sfcc.shopper-categories",
                        redirectUri: "http://localhost:3000/callback",
                        channels: ["RefArch", "RefArchGlobal"],
                        isPrivateClient: false,
                    },
                ],
            };

            fetchStub.returns(
                Promise.resolve(
                    new Response(JSON.stringify(response), { status: 200 })
                )
            );

            await slas.cli.client.list(TENANT);

            sinon.assert.calledOnce(fetchStub);
            sinon.assert.calledWithMatch(
                fetchStub,
                slas.getSlasUrl(TENANT),
                sinon.match({
                    headers: {
                        Authorization: `Bearer ${TOKEN}`,
                        "Content-Type": "application/json",
                    },
                })
            );
        });

        it("Deletes", async () => {
            fetchStub.returns(
                Promise.resolve(new Response(null, { status: 204 }))
            );

            await slas.cli.client.delete(CLIENT);

            sinon.assert.calledOnce(fetchStub);
            sinon.assert.calledWithMatch(
                fetchStub,
                slas.getSlasUrl(CLIENT),
                sinon.match({
                    headers: {
                        Authorization: `Bearer ${TOKEN}`,
                        "Content-Type": "application/json",
                    },
                    method: "DELETE",
                })
            );
        });
    });
});
