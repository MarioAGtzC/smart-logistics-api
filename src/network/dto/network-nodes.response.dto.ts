export class NetworkNodesResponseDto {
  /** Id returned by POST /network/upload. */
  graphId: string;

  /** Distinct node ids, in order of first appearance in the uploaded edges. */
  nodes: string[];
}
