import React, { ReactElement } from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { gql, useApolloClient, useQuery } from "@apollo/client";
import schema from "../../__tests__/schema";
import MockedProvider from "../ErgonoMockedProvider";

const Parent = (props): ReactElement => {
  return (
    <div>
      <ChildA shapeId={props.shapeId} />
    </div>
  );
};

const QUERY_A = gql`
  query OperationA($shapeId: String) {
    queryShape(id: $shapeId) {
      id
      returnInt
      returnString
      returnCustomScalar
    }
  }
`;

const ChildA = ({ shapeId }: { shapeId: string }): ReactElement => {
  const { loading, error, data } = useQuery(QUERY_A, { variables: { shapeId } });
  if (loading) return <p>Component ChildA: Loading</p>;
  if (error) return <p>Component ChildA: Error</p>;

  return (
    <div>
      Component ChildA.
      <p>returnString: {data.queryShape.returnString}</p>
      <p>returnInt: {data.queryShape.returnInt}</p>
      <p>returnCustomScalar: {data.queryShape.returnCustomScalar}</p>
    </div>
  );
};

test("Can render a nested tree of components with appropriate mocking", async () => {
  const spy = jest.fn();
  const { findByText } = render(
    <MockedProvider schema={schema} onCall={spy}>
      <Parent />
    </MockedProvider>
  );

  expect(await findByText(/returnInt: -?[0-9]+/)).toBeVisible();
  const { operation, response } = spy.mock.calls[0][0];
  expect(await findByText(new RegExp(response.data.queryShape.returnString))).toBeVisible();
  expect(operation.operationName).toEqual("OperationA");
  expect(operation.variables).toEqual({});
  expect(response).toMatchObject({
    data: {
      queryShape: {
        returnString: expect.toBeString(),
        returnInt: expect.toBeNumber()
      }
    }
  });
});

test("can accept mocks per operation name", async () => {
  const spy = jest.fn();
  const mocks = {
    OperationA: {
      queryShape: {
        returnString: "John Doe"
      }
    }
  };
  const { findByText } = render(
    <MockedProvider schema={schema} onCall={spy} mocks={mocks}>
      <Parent />
    </MockedProvider>
  );

  expect(await findByText(/returnString: John Doe/)).toBeVisible();
  expect(await findByText(/returnInt: -?[0-9]+/)).toBeVisible();
  const { operation, response } = spy.mock.calls[0][0];
  expect(operation.operationName).toEqual("OperationA");
  expect(operation.variables).toEqual({});
  expect(response).toMatchObject({
    data: {
      queryShape: {
        returnString: "John Doe",
        returnInt: expect.toBeNumber()
      }
    }
  });
});

test("can mock the same operation multiple times in the same tree", async () => {
  const spy = jest.fn();
  const mocks = {
    OperationA: {
      queryShape: {
        returnString: "John Doe"
      }
    }
  };
  const { findAllByText } = render(
    <MockedProvider schema={schema} onCall={spy} mocks={mocks}>
      <>
        <Parent shapeId="123" />
        <Parent shapeId="124" />
      </>
    </MockedProvider>
  );

  expect(await findAllByText(/returnString: John Doe/)).toHaveLength(2);
  expect(await findAllByText(/returnInt: -?[0-9]+/)).toHaveLength(2);
  const { operation, response } = spy.mock.calls[0][0];
  expect(spy).toHaveBeenCalledTimes(2);
  expect(operation.operationName).toEqual("OperationA");
  expect(operation.variables).toEqual({ shapeId: "123" });
  expect(response).toMatchObject({
    data: {
      queryShape: {
        returnString: "John Doe",
        returnInt: expect.toBeNumber()
      }
    }
  });
});

test("can mock the same operation multiple times with a function", async () => {
  const spy = jest.fn();
  const mocks = {
    OperationA: operation => {
      return {
        queryShape: {
          id: operation.variables.shapeId, // you need to return the ID to have separate cache entry
          returnString: `John Doe ${operation.variables.shapeId}`,
        },
      };
    }
  };
  const { findAllByText } = render(
    <MockedProvider schema={schema} onCall={spy} mocks={mocks}>
      <>
        <Parent shapeId="123" />
        <Parent shapeId="124" />
      </>
    </MockedProvider>
  );

  expect(await findAllByText(/returnString: John Doe 123/)).toHaveLength(1);
  expect(await findAllByText(/returnString: John Doe 124/)).toHaveLength(1);
  expect(await findAllByText(/returnInt: -?[0-9]+/)).toHaveLength(2);
  const { operation, response } = spy.mock.calls[0][0];
  expect(spy).toHaveBeenCalledTimes(2);
  expect(operation.operationName).toEqual("OperationA");
  expect(operation.variables).toEqual({ shapeId: "123" });
  expect(response).toMatchObject({
    data: {
      queryShape: {
        returnString: "John Doe 123",
        returnInt: expect.toBeNumber()
      }
    }
  });
});

test("it allows the user to provide default mock resolvers", async () => {
  const spy = jest.fn();
  render(
    <MockedProvider
      schema={schema}
      onCall={spy}
      resolvers={{
        Shape: (_, args) => ({
          returnString: `John Doe ${args.id}`,
        }),
      }}
    >
      <Parent shapeId="123" />
    </MockedProvider>
  );

  expect(await screen.findByText(/returnString: John Doe 123/)).toBeVisible();
  expect(await screen.findByText(/returnInt: -?[0-9]+/)).toBeVisible();
  const { operation, response } = spy.mock.calls[0][0];
  expect(spy).toHaveBeenCalledTimes(1);
  expect(operation.operationName).toEqual("OperationA");
  expect(operation.variables).toEqual({ shapeId: "123" });
  expect(response).toMatchObject({
    data: {
      queryShape: {
        __typename: "Shape",
        returnString: "John Doe 123",
        returnInt: expect.toBeNumber(),
      },
    },
  });
});

test("automocking is stable and deterministic per operation query, name and variable", async () => {
  const spy1 = jest.fn();
  const spy2 = jest.fn();
  const { findByText } = render(
    <MockedProvider schema={schema} onCall={spy1}>
      <Parent shapeId="123" />
    </MockedProvider>
  );
  await findByText(/returnString/);

  cleanup();
  const { findByText: fbt2 } = render(
    <MockedProvider schema={schema} onCall={spy2}>
      <Parent shapeId="123" />
    </MockedProvider>
  );

  await fbt2(/returnString/);
  const { response: r1 } = spy1.mock.calls[0][0];
  const { response: r2 } = spy2.mock.calls[0][0];
  expect(r1).toEqual(r2);
});

test("automocking is stable and deterministic per operation query, name and variable", async () => {
  const spy1 = jest.fn();
  const spy2 = jest.fn();
  const { findByText } = render(
    <MockedProvider schema={schema} onCall={spy1}>
      <Parent shapeId="123" />
    </MockedProvider>
  );
  await findByText(/returnString/);

  cleanup();
  const { findByText: fbt2 } = render(
    <MockedProvider schema={schema} onCall={spy2}>
      <Parent shapeId="124" />
    </MockedProvider>
  );

  await fbt2(/returnString/);
  const { response: r1 } = spy1.mock.calls[0][0];
  const { response: r2 } = spy2.mock.calls[0][0];
  expect(r1).not.toEqual(r2);
});

test.each([
  [undefined, 'Shape'], // addTypename default to true
  [true, "Shape"],
  [false, undefined],
])(
  "it will return the correct value for __typename when addTypename is set to %s",
  async (addTypename, expectedValue) => {
    const spy = jest.fn();
    render(
      <MockedProvider schema={schema} onCall={spy} addTypename={addTypename}>
        <Parent shapId="123" />
      </MockedProvider>
    );
    await screen.findByText(/returnString/);
    const {
      response: {
        data: {
          queryShape: { __typename },
        },
      },
    } = spy.mock.calls[0][0];
    expect(__typename).toEqual(expectedValue);
  }
);

const ComponentWithCacheUpdate = ({ shapeId }: { shapeId: string }): ReactElement => {
  const { loading, error, data } = useQuery(QUERY_A, { variables: { shapeId } });
  const { cache } = useApolloClient();

  const onClick = React.useCallback(() => {
    cache.modify({
      id: `Shape:${shapeId}`,
      fields: { returnInt: (current) => current + 1 }
    })
  }, [cache, data]);

  if (loading || error) return null;

  return (
    <div>
      <p>id: {data.queryShape.id}</p>
      <p>returnInt: {data.queryShape.returnInt}</p>
      <button onClick={onClick}>INCREMENT</button>
    </div>
  );
}

describe('copyFieldsFromVariables', () => {
  test('Automatically copies id from variables', async () => {
    const shapeId = '111';
    const copyFieldsFromVariables = {
      queryShape: { id: 'id' },
    };

    const { findByText } = render(
      <MockedProvider schema={schema} copyFieldsFromVariables={copyFieldsFromVariables}>
        <ComponentWithCacheUpdate shapeId={shapeId} />
      </MockedProvider>
    );

    expect(await findByText(`id: ${shapeId}`)).toBeVisible();
  });
  test('Object is stored by copied id in cache', async () => {
    const mocks = {
      OperationA: {
        queryShape: { returnInt: 10 },
      }
    };
    const copyFieldsFromVariables = {
      queryShape: { id: 'id' },
    };

    const { findByText } = render(
      <MockedProvider schema={schema} mocks={mocks} copyFieldsFromVariables={copyFieldsFromVariables}>
        <ComponentWithCacheUpdate shapeId="1" />
      </MockedProvider>
    );

    expect(await findByText('returnInt: 10')).toBeVisible();

    const button = await findByText('INCREMENT');
    fireEvent.click(button);

    expect(await findByText('returnInt: 11')).toBeVisible();
  });
  test('Copied fields are overridden by mocks', async () => {
    const mockShapeId = '1';
    const mocks = {
      OperationA: {
        queryShape: { id: mockShapeId },
      }
    };
    const copyFieldsFromVariables = {
      queryShape: { id: 'id' },
    };

    const { findByText } = render(
      <MockedProvider schema={schema} mocks={mocks} copyFieldsFromVariables={copyFieldsFromVariables}>
        <ComponentWithCacheUpdate shapeId="2"/>
      </MockedProvider>
    );

    expect(await findByText(`id: ${mockShapeId}`)).toBeVisible();
  });
  test('Copied fields overriddes resolvers', async () => {
    const shapeId = '2';
    const resolvers = {
      Shape: () => ({ id: '1' }),
    }
    const copyFieldsFromVariables = {
      queryShape: { id: 'id' },
    };

    const { findByText } = render(
      <MockedProvider schema={schema} resolvers={resolvers} copyFieldsFromVariables={copyFieldsFromVariables}>
        <ComponentWithCacheUpdate shapeId="2"/>
      </MockedProvider>
    );

    expect(await findByText(`id: ${shapeId}`)).toBeVisible();
  });
});
